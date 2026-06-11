# Daemon Sessions —— `xdoc daemon` 多步 Agent 工作流加速

> 一次 `xdoc pptx apply` 要做完整四件事：起进程 → 读 PPTX zip → 解 OOXML 模型 →
> 应用 patch + 序列化输出。多步 Agent 工作流（典型："inspect 看现状 → apply 改
> 标题 → inspect 验证 → apply 改颜色 → ..."）反复重复前三步是浪费。daemon 把
> 模型留在内存里，让后续调用按 session 复用。
>
> **v10 起 daemon 默认自动拉起（auto-spawn）**：不再需要手动 `xdoc daemon start`，
> 任何带 `--daemon` 的 `pptx apply|inspect` 调用在检测到 daemon 未运行时会
> 自动 fork 一个 detached daemon 进程并等其就绪。下面所有命令直接加 `--daemon`
> 就行。

## §1 起手最短路径

```bash
# 直接用 — 第一次会自动拉起 daemon（~200ms 启动开销）
xdoc pptx inspect deck.pptx --daemon --json | save inspect.json

# 状态查询 / 显式关闭（status / stop 不会触发 auto-spawn）
xdoc daemon status --json
xdoc daemon stop
```

如果你仍然偏好显式拉起（CI 里用 `trap` 清理、或想一次写好日志路径），手动
`xdoc daemon start` 仍然可用：

```bash
xdoc daemon start &           # 前台进程，& 放后台
nohup xdoc daemon start >/tmp/xdoc-daemon.log 2>&1 &
```

但**绝大多数 Agent 场景下不需要显式 start** —— auto-spawn 已经接管。

## §2 客户端用法

任意 `pptx apply` 或 `pptx inspect` 调用加 `--daemon`（auto-spawn + 优雅回退）
或 `--daemon-strict`（auto-spawn 失败时硬错而不是 fallback）：

```bash
# 默认模式：auto-spawn + 失败 fallback 到一次性
xdoc pptx inspect deck.pptx --daemon --json | save inspect.json

# 严格模式：CI / 脚本里防止"误用一次性、看不出来"；auto-spawn 失败也直接 DaemonUnavailable
xdoc pptx apply -p patch.json -i deck.pptx -o deck.pptx --daemon-strict --overwrite
```

⚠️ **`--daemon` 只对 `pptx apply` / `pptx inspect` 生效**。`pptx from-data` /
`pptx check-brand` / `pptx new` / `pptx catalog` / `pptx recipe` /
`pptx replay|audit|rollback` 都**不接受** `--daemon`（解析阶段会报
`xdoc pptx --daemon is only valid with apply or inspect`）。

session 按 `canonical(input_path)` 键化：同一个 input deck 多次调用复用同一份
内存 Presentation：

- `inspect` 直接读内存模型，几乎零成本
- `apply` 仍然先生成一个候选快照，失败时不污染 live session；成功后用新
  Presentation 替换原 session，**所以 dry-run 也会受益**（避开重复解析）

## §3 关键环境变量

| 变量                           | 默认                             | 含义                                                        |
| ------------------------------ | -------------------------------- | ----------------------------------------------------------- |
| `XDOC_DAEMON_AUTO_SPAWN`       | `1`                              | v10 新：`0` / `false` 关闭 auto-spawn；CI/sandbox 隔离用    |
| `XDOC_DAEMON_SPAWN_TIMEOUT_MS` | `5000`                           | v10 新：auto-spawn 后等 daemon 就绪的最长时间（毫秒）       |
| `XDOC_DAEMON_LOG`              | `$TMPDIR/xdoc-daemon.log`        | v10 新：auto-spawn 出来的 daemon stdout/stderr 合并日志路径 |
| `XDOC_DAEMON_ADDR`             | `127.0.0.1:0`（随机端口）        | 监听地址；端口 0 = 自动分配                                 |
| `XDOC_DAEMON_STATE`            | `$TMPDIR/xdoc-daemon-state.json` | 状态文件路径（含地址 + token）；lock 文件自动加 `.lock`     |
| `XDOC_DAEMON_IDLE_MS`          | `300000`（5 分钟）               | 单个 session 空闲多久后淘汰                                 |
| `XDOC_DAEMON_MAX_SESSIONS`     | `64`                             | 同时常驻的 session 上限（LRU 淘汰）                         |

跨平台 temp 目录探测顺序：`TMPDIR` → `TEMP` → `TMP` → `LOCALAPPDATA`（Windows）。

> ⚠️ token 用 `BCryptGenRandom`（Windows）/`arc4random_buf`（Apple/BSD）/
> `getrandom`（Linux）/`/dev/urandom`（fallback）生成，不是时间戳，不会被预测。
> state 文件写入用 `.tmp.<random>` + atomic rename，删除用 `.removed.<random>` +
> delete，避免 TOCTOU，所以可以放心放在 `$TMPDIR`。
>
> auto-spawn 的并发安全靠 `<state>.lock` 文件 + `CreateMode::CreateNew`（=
> `O_CREAT|O_EXCL`）选出单一赢家；lock 内容 `{pid, deadlineMs, startedAtMs}`，
> stale 判定 = deadline 已过 OR 文件中 pid 不再存活（`kill(pid,0)` 探测）。

## §4 与 dry-run / sidecar 的关系

daemon 不改变 patch 语义，只改变执行链路：

- `--dry-run --json` 在 daemon 模式下同样工作，且更快（共用 in-memory model）
- 写盘时 sidecar 文件 `<out>.s8fy.json` 照常生成，后续 `rollback --from-sidecar`
  不依赖 daemon
- `apply` 失败时 live session 不变，可以接着 inspect 看当前状态
- **agent schema 渲染缓存**：daemon 启动时会预热一次 `xdoc schema` 的 JSON
  渲染（多 KB / 多结构），后续每次 schema 取用从 in-memory 缓存深拷贝返回。
  Agent 反复拉 `--index` / `--op <name>` / 切 `--minimal` 都不会再付重新构建
  schema 的成本

## §5 典型 Agent 多步工作流

### 5.1 inspect-driven 修改（典型 Agent loop）

```bash
# 注意：不再需要 daemon start！第一次 --daemon 调用自动拉起
xdoc pptx inspect deck.pptx --daemon --json | save inspect.json

# Agent 根据 inspect 生成 patch1.json（改主标题文字）
xdoc pptx apply -p patch1.json -i deck.pptx -o deck.pptx --daemon --overwrite --dry-run --json | save dry1.json
xdoc pptx apply -p patch1.json -i deck.pptx -o deck.pptx --daemon --overwrite

# 第二轮：验证 + 下一步（命中已在内存中的 session，秒回）
xdoc pptx inspect deck.pptx --daemon --json | save inspect-after.json
# ... 多轮修改 ...

# 可选：完事后关 daemon；不关也行，5 分钟 idle 后 session 自动淘汰
xdoc daemon stop
```

### 5.2 批量场景：同一模板上反复 apply / inspect

```bash
# 注意：from-data 不接 --daemon。批量数据驱动场景仍是一次性进程
for data in data/*.json; do
  out="dist/$(basename $data .json).pptx"
  xdoc pptx from-data $data --template template.pptx -o $out --overwrite
done

# 但如果你的批量是"反复改同一个 deck"，daemon 收益巨大：
for patch in patches/*.json; do
  xdoc pptx apply -p $patch -i deck.pptx -o deck.pptx --daemon --overwrite
done
```

### 5.3 CI / 自动化测试

CI 里用 `--daemon-strict`，保证测试真的复用了 session（否则 auto-spawn fallback
可能掩盖性能回归）；用 `trap` 清理后台 daemon：

```bash
trap 'xdoc daemon stop >/dev/null 2>&1' EXIT
# 第一个 --daemon-strict 调用会触发 auto-spawn，失败直接报错
xdoc pptx inspect deck.pptx --daemon-strict --json >/dev/null
# ... 跑测试 ...
```

### 5.4 sandbox / 不允许 fork 的环境

某些容器 / sandbox 禁止子进程；这种环境关闭 auto-spawn 强制走一次性：

```bash
export XDOC_DAEMON_AUTO_SPAWN=0
# 此后 --daemon 在 daemon 不在时直接 fallback（不再尝试 fork）
# --daemon-strict 在 daemon 不在时直接 DaemonUnavailable
```

## §6 不要做的事

- **不要在多个独立任务之间共享同一个 daemon** — session 上限 64，LRU 淘汰会把
  "另一个任务正在用的"模型踢掉
- **不要假设 daemon 长时间常驻** — `XDOC_DAEMON_IDLE_MS` 默认 5 分钟，Agent 工作流
  之间有长时间停顿时模型已经被释放，下一次调用会重新加载（行为正确，但失去
  加速）
- **不要在 daemon 模式下手动覆写 `<out>.s8fy.json`** — sidecar 由 apply 路径自己
  写；手动改会让 rollback 失败
- **不要给 `from-data` / `check-brand` / `apply-brand` / `copy-from` /
  `extract-style` / `import-template` / `new` / `catalog` / `recipe` /
  `replay` / `audit` / `rollback` 加 `--daemon`** —
  解析阶段会拒绝
- **Windows 上 daemon 仍在 MVP** — macOS/Linux 已稳定，Windows 路径走 `TEMP` /
  `TMP` / `LOCALAPPDATA` fallback，但 CI 覆盖还不全。生产 CI 用 Windows 时建议
  先用一次性模式跑通，再切 daemon

## §7 故障排查

| 现象                                       | 排查                                                                                         |
| ------------------------------------------ | -------------------------------------------------------------------------------------------- |
| `--daemon` 看着没加速（每次还是慢）        | `xdoc daemon status --json` 看 `status: running` 与 `sessionCount`；session 是否被复用       |
| auto-spawn 超时 `daemon spawn timeout`     | 磁盘慢或父目录权限问题？看 `$TMPDIR/xdoc-daemon.log`；调大 `XDOC_DAEMON_SPAWN_TIMEOUT_MS`    |
| `--daemon-strict` 报 "no daemon reachable" | auto-spawn 被关了？检查 `XDOC_DAEMON_AUTO_SPAWN`；或子进程 fork 被沙箱拒绝                   |
| inspect 返回旧数据                         | 上次 apply 没成功导致 session 没更新；`xdoc daemon stop` + 再 inspect 触发重载               |
| token 不匹配 / 权限拒绝                    | state 文件被旧 daemon 残留；`rm $XDOC_DAEMON_STATE` 后让下次 `--daemon` 自动重拉             |
| lock 文件残留（`<state>.lock`）            | auto-spawn 进程崩了；下次 `--daemon` 会自动判 stale（deadline 过 OR pid 死）并重抢           |
| 内存占用涨                                 | 检查 session 数（`status --json`）；把 `XDOC_DAEMON_MAX_SESSIONS` 调小，或主动 `daemon stop` |
| daemon stdout/stderr 看不到                | auto-spawn 出来的 daemon 输出在 `XDOC_DAEMON_LOG`（默认 `$TMPDIR/xdoc-daemon.log`）          |

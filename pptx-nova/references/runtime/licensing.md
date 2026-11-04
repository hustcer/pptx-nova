# Runtime 授权安装与诊断

用于用户要求安装、激活、续期 xdoc Runtime 授权，或实际任务遇到授权拒绝、授权不生效、
付费后仍有水印的情况。普通成功任务不额外维护授权；单独处理授权无需创建 outline、
DeckKit、PPTX 或运行视觉交付门禁。下载到本地的授权 JSON 是凭据，不是 deck 内容输入。

## 先确定执行环境与操作范围

- 用户已要求安装/续期并提供文件时，按该授权完成校验、安装和验证，无需重复询问许可。
  如果用户只要求解释或诊断，先做相应检查；不要顺手卸载、重置时钟或替换已有授权。
- 使用运行 pptx-nova 的同一个 xdoc、系统用户、工作目录和环境。先确认实际二进制及
  `xdoc --version`；显式配置的 `XDOC_BIN` 与 Agent 的 `PATH` 可能选中不同安装。
  缺少二进制时，按[官方入门指南](https://docs.structurify.io/en/pptx-runtime/getting-started/)
  安装已发布的 Runtime，再核对当前契约。
- 定向读取 `xdoc schema --command auth.verify`、`auth.install`、`auth.status`；只在需要
  恢复时读取 `auth.reset-clock` / `auth.uninstall`。报告通过各动作的
  `ioContract.stdout.schemaRef` 解引用，详见[Schema discovery](schema-discovery.md#典型-agent-用法)。
  文档示例不替代当前二进制的命令与报告契约。auth 输出本身是 JSON，使用 `--pretty`，
  不添加 `--json`。
- 只检查有关环境值：`XDOC_CONFIG_PATH`、用户 home（Windows 为 `APPDATA`）、`CI`、
  当前工作目录 `.env` 中对应项，以及该任务的显式 `--license`。CLI 启动时会读取当前
  工作目录的 `.env`；非空进程环境优先。不要输出整个环境或 `.env` 的无关秘密。

安装、续期会写授权配置和 Clock 状态；`status` 做完整准入，可能更新 Clock 状态，
不是严格只读。`verify` 只读指定文件，适合用户明确要求不改本机状态的检查。
开发验证须在新建临时私有绝对目录中设置 `XDOC_CONFIG_PATH`，不要触碰真实用户的授权。

## 安装与续期

1. 保留交付文件的原始 UTF-8 字节；有交付通知中的 SHA-256 时先比对。确认文件可读、
   是普通文件，并且客户端属于签发方支持的版本范围。Runtime 需要
   `xdoc-cli-license/v1`；Viewer/Converter 凭据不适用。文件原名可以保留，例如
   `runtime-personal.json`。不要修改签名载荷的日期、身份、功能或能力，也不要安装签名私钥。
2. 先校验指定文件；失败时按下表处理，修正条件后再继续：

   ```sh
   xdoc auth verify --license "/absolute/path/runtime-personal.json" --pretty
   ```

   签名/时间校验成功不代表已经安装，也不证明 Clock 防回拨准入、设备私钥持有证明或
   具体任务授权成功。用户只要求校验时，到此报告结果即可。

3. 选定配置目录，再安装原文件：

   ```sh
   xdoc auth install "/absolute/path/runtime-personal.json" --pretty
   xdoc auth status --pretty
   ```

   install 接收恰好一个位置文件，不能写成 `install --license ...`。auth 参数错误可能
   只有 stderr；分别保留实际退出码、stdout 和 stderr，不要把它们混合后作为 JSON 解析。

默认安装位置：POSIX 为 `$HOME/.config/xdoc/xdoc-license.json`，Windows 为
`%APPDATA%\xdoc\xdoc-license.json`。设置 `XDOC_CONFIG_PATH` 时，它表示**配置目录**，
必须是已存在、当前用户可访问的私有绝对目录；Runtime 在其中管理 `xdoc-license.json`。
先创建该目录并为实际执行用户设置私有权限（POSIX 通常目录 `0700`，Windows 使用相应
ACL），再在安装、status 和后续任务中保持相同环境。默认用户配置目录可由 Runtime 创建。
不要把 `XDOC_CONFIG_PATH` 指向下载的 JSON 文件，也不要只在 install 的一次调用中设置
它而让后续 Agent 任务使用另一个目录。普通用户安装使用用户目录即可，无需 `sudo`。

安装成功须同时看到 `status: "success"`、`outcome: "installed"`；核对 `installedPath`、
`installedSha256` 与实际交付文件，读取 `authenticatedFacts` 的有效期和能力。
健康的 status 应满足以下关键字段（这不是完整报告）：

```json
{
  "health": "healthy",
  "verification": { "state": "verified" },
  "admission": { "state": "admitted" },
  "taskAuthorization": "not-evaluated"
}
```

同时将 `source.path` / `source.sha256` 与 install 报告比对。status 退出 0 只表示查询完成，
`not-installed`、`unhealthy` 也可能返回 0；查看 `verification.reason`、`admission.reason`
和 `clock`，不能据此宣称授权健康或任务通过。

续期使用同一套命令安装**新交付文件**，然后重复 status 和实际任务验证。新授权会替换
选定配置目录内的旧授权；保留原交付文件，不先 uninstall。出现不同身份/授权谱系或更早
到期的替换提示时，核对是否选错文件；不要把编辑旧 JSON 的到期日当作续期。

### 安装结果不确定

`outcome: "uncertain"` / `auth_install_outcome_uncertain` 表示发布可能已经发生。
保留报告中的 `targetPath`、`attemptedSha256` 和 `publication`，在**相同环境**运行 status：

- 目标路径和 `source.sha256` 与尝试安装的文件一致，且 health/admission 健康：记录当前
  可观察到的安装结果，继续实际任务验证；保留原 uncertain 报告。
- 仍是旧文件、无文件或状态无法确定：检查权限、存储和并发任务，条件修正后按原交付文件重试。
- 发现其他进程安装了不同的新文件：先核对该替换是否符合当前任务，避免覆盖更新的授权。

不要假定失败意味着旧文件完全没变，不自动回滚、删除目标或通过手工复制绕过安装准入。

## 验证具体任务

安装和 status 验证的是本地凭据，任务仍按实际 feature、输出格式、能力及宿主事实求解。
有用户原任务时，优先在同一环境恢复该任务，保留其严格约束和原始输入，使用新输出路径。
不要仅凭 PDF 转换成功就宣称创建、修改、翻新、翻译全部获授权。

需要独立验证转换时，用一份已知正常、原本无水印的 PPTX 和尚不存在的输出文件：

```sh
xdoc convert "./slides.pptx" --to pdf --output "./licensed-check.pdf" --require-unwatermarked --report "./licensed-check-report.json"
```

先在 `xdoc schema --command convert` 中确认参数；`--require-unwatermarked` 在无法获得
无水印模式时拒绝任务。若只需证明付费 entitlement，且当前命令披露该选项，可用
`--require-entitlement`。convert 的 stdout 不保证是 JSON；当前契约披露的 `--report` 可保存
`batch/v1` 报告，检查 `items[].error` 的 `kind`、`stage` 和 `details.reason`。失败仍可能
只有 stderr，不能假造授权报告。检查实际退出码、已有报告和生成文件；仅有授权文件，
缺少适合的任务输入时，如实报告“已安装且健康，具体任务尚未验证”，不要虚构验证成功。

一次性的 convert 可以显式选择凭据，该方式不安装到用户配置：

```sh
xdoc convert "./slides.pptx" --to pdf --output "./explicit-check.pdf" --license "/absolute/path/runtime-personal.json" --require-unwatermarked
```

`xdoc pptx` 的创建/编辑使用已安装凭据，不套用 convert 的 `--license`。其他命令只使用
它们当前 schema/help 实际披露的参数；不要猜测所有子命令都支持严格开关。

付费授权不会抹除任意输入内容水印。输入中已有的普通 Free 标记、签名水印义务和新输出
授权分别处理；旧的带水印文件直接转换后仍有水印，不足以证明安装失败。不要删除签名元数据
或改用其他格式来绕过义务。配额与资源区别见[转换输入配额与授权失败](troubleshooting.md#转换输入配额与授权失败)。

## 已安装但未被任务使用

对支持显式凭据的命令，查找顺序是：命令的 `--license` → 配置了 `XDOC_CONFIG_PATH` 时
该目录中的 `xdoc-license.json` → 平台用户默认目录。选中了更高优先级来源后，文件缺失、
不可读或无效不会自动改读较低优先级的凭据。项目目录里的任意 JSON 不会自动被发现。

按任务实际执行环境逐项比较：

1. 二进制路径/版本、用户/home、工作目录 `.env`、`XDOC_CONFIG_PATH` 和 `source.path`/hash。
2. 命令是否仍有旧的显式 `--license`，或者 Agent/IDE 从不同启动环境继承了变量。
3. daemon 是否仍使用旧环境；修改配置环境后按[daemon 指南](daemon-sessions.md)重启相应
   长期进程，再在同一环境检查状态/任务，不终止无关任务。
4. 容器或本地定时任务是否使用另一用户/配置路径；主机安装不会自动把文件复制进容器。

Personal/Enterprise 本地授权并不自动包含 CI、跨用户共享服务器或 Service/API 使用权。
非空 `CI` 除大小写不敏感的 `0` / `false` 外会触发 CI 判断。检查真实执行方式和已签发
能力；需要相应交付时说明缺项并由用户向签发方申请，不篡改宿主事实或用
`--allow-fallback` 绕过能力拒绝。商业授权失效时也不静默降为 Free：保留用户的无水印/
严格授权约束，只在用户已明确接受且当前任务符合 Free 条件时才走披露的 fallback。

## 按实际 reason 恢复

以下是按症状选择的处理方向；完整 reason 集合和退出码由当前 action/report schema 决定。
参数错误通常为 exit 2；install 的文件读取失败为 3、凭据拒绝为 4、写入失败/不确定为 9。
没有 JSON 时保留 stderr，不从错误文案猜造报告字段。

| 观察到的结果                                                                                                                      | 检查与恢复                                                                                                                                                                         |
| --------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cli_license_file_read_failed`                                                                                                    | 核对真实文件路径、大小写、当前用户的读取/目录遍历权限，确认是可读普通文件。保留原文件，不自动 sudo 或改变无关目录权限。                                                            |
| `cli_license_too_large`                                                                                                           | 当前 verify/install 输入上限从 schema 的 `ioContract.input.maxBytes` 读取（当前为 65,536 字节）。确认拿到的是原始凭据而非整份归档/网页，向签发方重新获取；不要截断或精简签名文件。 |
| JSON/envelope/payload 格式错误，如 `cli_license_json_invalid` / `cli_license_envelope_invalid`                                    | 排查下载到 HTML、复制截断或错误产品文件，重新获取原始 Runtime JSON；不要修补签名载荷。                                                                                             |
| `cli_license_schema_unsupported` / `cli_license_kind_unsupported` / `cli_license_key_not_found` / `cli_license_signature_invalid` | 核对 Runtime 产品、交付 hash 和客户端支持范围；使用签发方支持的已发布客户端或要求更正交付，不自行添加信任密钥。                                                                    |
| `cli_license_expired` / `cli_license_clock_invalid`                                                                               | 核对系统真实时间和交付有效期；已过期安装续期文件，尚未生效的凭据等待合法生效或要求更正。reset-clock 不续期、不改变签发日期。                                                       |
| `health: "not-installed"`                                                                                                         | 对照用户、配置目录、cwd `.env` 和来源；将文件安装到任务真正使用的目录。仅下载文件或运行 verify 不会安装。                                                                          |
| `health: "unhealthy"` 或 verify 通过但 install/任务拒绝                                                                           | 读取 verification/admission/clock 的实际 reason，分别排查有效期、Clock、设备绑定、撤销及具体 feature/capability。不要重复安装相同文件期待权限变化。                                |
| `config_path_invalid` / `auth_config_invalid`                                                                                     | 确认 `XDOC_CONFIG_PATH` 是已存在的私有绝对目录而非 JSON/相对路径；排查路径别名和受管理目标的符号链接，用实际普通目录再试。                                                         |
| `auth_storage_unavailable` / `auth_install_failed`                                                                                | 检查当前用户的目录/文件权限、只读挂载、磁盘空间和占锁进程。必要时使用新的受控私有目录，并同步后续任务环境；不要 chmod 777、递归改权限或删除锁文件。                                |
| `outcome: "uncertain"`                                                                                                            | 按上面的路径/hash 比对流程确认发布事实，再决定是否重试同一交付；不自动回滚。                                                                                                       |
| `clock_anomaly`                                                                                                                   | 走下节受控 Clock 恢复，先校准系统时间并停止相关任务/daemon。                                                                                                                       |
| `device_pop_failed`                                                                                                               | 签名有效不证明当前宿主持有绑定设备私钥；核对交付是否绑定本设备及该已发布 Runtime 是否支持其宿主能力，向签发方申请适配或重发。不复制私钥或删除 devicePublicKey。                    |
| `credential_revoked` 或撤销回执验证错误                                                                                           | 保存实际 reason 和授权 hash，向签发方核实撤销状态/获取更正交付；不删除回执、限制策略或状态来绕过拒绝。                                                                             |
| 凭据健康，但任务为 `no_executable_mode` / `strict_mode_unsatisfied` / exit 4                                                      | 看本次授权诊断的具体原因、feature、格式、能力和输入范围；不将所有 exit 4 都解释为坏文件或过期，不靠拆页/删图/换格式自动规避。                                                      |
| 凭据健康，仍有资源/字体/输入错误                                                                                                  | 按[运行时排障](troubleshooting.md)处理实际文件和工程上限；付费授权不提高编译资源上限。                                                                                             |

### Clock 恢复与卸载

只有已观察到 `clock_anomaly` 且用户的恢复请求覆盖该操作时，才执行时钟恢复：先校准真实
系统时间，停止本次使用的任务与 daemon，确认同一配置目录，然后读取
`xdoc schema --command auth.reset-clock` 并执行：

```sh
xdoc auth reset-clock --pretty
xdoc auth status --pretty
```

reset 只删除受支持的固定 Clock anchor，保留授权和锁文件。按实际报告处理
`auth_clock_reset_failed`、`auth_clock_reset_outcome_uncertain` 或
`auth_clock_reset_unsupported`；无法 reset 时说明限制并向签发方求助，不手删目录或锁文件。
在新进程中检查状态，再恢复相关长期进程和原任务；reset 不能让过期、未来生效、设备不匹配
或已撤销凭据变为有效。不将 reset 作为首次安装的准备步骤。

仅当用户要求停止使用/移除已安装授权时，运行 `xdoc auth uninstall --pretty`；它只移除
当前选定配置目录中的授权，保留 Clock 状态和锁文件，不删除下载原件，也不移除其他显式
`--license` 文件。卸载后的 Free 可用性仍取决于真实任务条件。

## 证据与交接

按需要在新的任务证据目录保留二进制身份、相关定向 schema、实际命令、cwd/必要环境、
退出码、auth 报告与 stderr，以及真实任务报告/输出。将交付 hash、install hash、status
source hash 串起来；不要复制原始授权、私钥或无关环境进共享证据或版本库。
向用户说明实际完成的是诊断、安装健康、还是具体任务验证成功；无法自行修复时给出
实际 reason、受影响功能/环境和需要签发方更正的内容。未经用户明确要求不向外发送报告。

参考：[官方授权说明](https://docs.structurify.io/en/pptx-runtime/licensing/)
及其[机器可读版本](https://docs.structurify.io/llms.mdx/docs/en/pptx-runtime/licensing/content.md)。
该说明标注的客户端范围可能与当前二进制不同；执行时以该二进制的 schema/help、实际报告
和签发方交付范围共同确认，勿从本地源码推导未发布的激活、联网续期或设备迁移能力。

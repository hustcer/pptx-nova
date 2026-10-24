# 2026-10-24 pptx-nova 运行时对齐评估

结论：需要更新技能指引；现有能力探测、标准 runner 和 DeckKit 生成逻辑可以沿用。
本次补齐图表写入限制、数据重建后的样式恢复、自动图表布局、文本保真诊断与
Viewer 录像的证据边界，没有增加必需运行时依赖或修改 DeckKit 设计。

## 评估范围与依据

覆盖上游 `968dffe88` 本身及之后直至 `a79e6eaa2` 的全部 29 个提交。
核对提交差异、公开变更记录、TypeScript 回归用例，以及本地实际可执行文件的
`xdoc --version`、能力探测、操作 schema 和执行报告。
当前实测运行时是干净的 `0.15.0 (a79e6eaa)`；版本号本身不作为能力路由依据。
已有 `docs/xdoc-schema.json` 的身份与之相同，本次没有刷新或手改该快照。

| 变化组及提交                                                                                                                                                                         | 评估与处理                                                                                                                                                                                                                 |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 版本/发布：`968dffe88`、`0cee20323`、`a79e6eaa2`                                                                                                                                     | 保留实时 schema 路由；修正 README 与安装文档中旧的运行时哈希。SDK 版本准备不能证明已发布，也不构成新增 CLI 能力。                                                                                                          |
| 环形图写入：`92a5aa13a`、`993a96282`                                                                                                                                                 | 更新 `charts.md`：拒绝 plot/series/point 显式 position（包括 center）；新建 standard/exploded 显式孔径 50，局部编辑省略孔径则保留。实操补充数据重建会重置孔径及恢复方式。                                                  |
| 自动轴/堆叠：`c7c87cc1e`、`903d1fe35`、`b6fd09880`、`8c0f1bb2e`、`907390eae`、`295d5f7f1`、`3ae307d8a`、`123032ca1`、`aa1e9c00f`、`9036bbdd9`、`67e7c98af`、`79161111e`、`36e6af3e3` | 更新 `charts.md` 与入口路由：单边界锚定、窄正值/log 域、字体容量、category fitting、绘制缩写与完整提取文本的区别。明确面积图和 3D 条形图各自的百分比累积规则。                                                             |
| 文本/图片/字体：`a1b710ce1`、`9216395ce`、`78017571f`、`92268b92a`、`92d56d911`                                                                                                      | 更新 `fidelity-diagnosis.md`：独立文本角度与组变换、受支持 SmartArt cache、阴影/剪裁、轮廓与可选中文本、符号空白、图片编辑效果与 shade。渲染改善不升级 authoring/Office 保真承诺；生产 Worker 改动不要求 CLI runner 改写。 |
| 播放/录制/上传：`967089593`、`ea2c8e586`、`2d6e2df16`                                                                                                                                | 更新 `viewer-playback.md`：单静态页零停留循环的正间隔回退，以及真实播放录像的时间、页序、解码和失败证据。框架 callback 修复沿用既有实际 build/API 检查。上传工具属于维护环境，不加入发布技能依赖。                         |
| 工具/构建：`acdebd730`、`90967e29a`、`902f75ecd`                                                                                                                                     | 依赖升级、编译 flag 与维护侧 PDF 按钮定位不改变用户侧 xdoc 契约；无需引入工具或新增必经步骤。                                                                                                                              |

既有 annual 类组件已省略 doughnut 标签位置，其他已捆绑 doughnut 组件也未发现需要
修正的显式标签位置，因此没有为文档更新改动组件或历史基准结果。

## 实操验证

完整本地证据位于 `.pptx-nova/runtime-alignment-20261024/`，不进入发布技能。
`verify.mjs` 是本次专用 Node 验证脚本；`verification.json` 记录断言，原始报告和失败请求均保留。

- 生成 8 页原生图表验证文件：standard/exploded doughnut、显式孔径 62、pie center、
  长 category、大字号自动适配、显式下界 1.03、正负百分比 area 与 3D bar。
- dry-run/apply 均成功且 `semanticIssues=[]`；vision 高/中/低问题均为 0，
  `semanticSummary.passed=true`。8 页 JSON 回读逐项匹配类别顺序、系列名与原始数值。
- 原生 chart XML 验证新建 doughnut 恰有一个孔径 50/50/62，均无显式 label position；
  pie 仍允许 center 且没有 holeSize。三个作用域的非法 doughnut center 在 dry-run 和
  apply 均被拒绝，未生成候选文件。
- `set-chart-data` 的实测限制：原孔径 62 变为 50。记录后按新指引重新应用 62，
  再执行省略孔径的局部编辑，最终仍为 62。该行为已写入指引，未声称数据重建保留样式。
- PDF/PNG 导出完成，Agent 检查了 8 页 contact sheet。第 5 页画面为 `Other…`，
  PDF 提取和 JSON 保留 `Other Infrastructure`；第 6 页保留 1.03 下界刻度。
  面积图按系列顺序累积，3D bar 正负各自累积，画面符合各自规则。
- Microsoft 365 compat 的 `agentGate.passed=true`，全包完整性扫描通过。
  PowerPoint for Mac clean-open 为 `pass`，没有 Repair 弹窗。
  轻量 structure-check 无错误；两个 warning 是测试夹具未声明预期字体/颜色。

本次没有把 clean-open 扩大解释为 PowerPoint 像素/回存/播放认证；没有执行浏览器 GIF
录制，也没有逐项重跑上游全部文本、surface 或 Web 回归。对应指引以已核对的上游行为为
依据，并要求具体任务重新验证实际消费者；8 页实操只证明上述明确列出的场景。

## 仓库检查

- 修改前后 smoke test 均通过；严格 public audit 均为 0 errors / 0 warnings。
- skill-creator 校验通过：`uv run --with pyyaml .../quick_validate.py pptx-nova`。
- 能力探测、chart canonical input、原生契约文件与运行时依赖策略测试：37 passed，
  32 skipped，0 failed。32 个 executable contract 用例未设置 `XDOC_TEST_BIN`，
  不计作运行时通过证据；本次运行时验证来自上面的真实 xdoc 调用。
- `git diff --check` 通过。没有变更必需运行时脚本、schema、DeckKit 或 assets，
  因此不需要重跑设计 readiness/benchmark 矩阵。

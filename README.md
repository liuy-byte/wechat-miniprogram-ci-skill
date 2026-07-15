# 微信小程序 CI Skill

一个面向 Codex 的 Agent Skill，使用微信官方 [`miniprogram-ci`](https://developers.weixin.qq.com/miniprogram/dev/devtools/ci.html) 对 uni-app 微信小程序执行生产构建、上传前预检和代码上传。

本项目默认只做预检。真实上传前必须由用户核对并确认构建产物中的 AppID；上传成功仅代表代码已进入微信小程序后台，**不会**自动设为体验版、提交审核或正式发布。

## 能力与安全边界

- 可选执行 uni-app 微信小程序生产构建，默认脚本为 `build:mp-weixin`。
- 校验版本号、上传描述、机器人编号、上传密钥、产物目录和 `project.config.json`。
- 从构建产物读取 AppID，并与预期 AppID、二次确认 AppID 交叉校验。
- 使用锁定版本的微信官方 `miniprogram-ci 2.1.31` 上传代码。
- 默认不上传；只有同时传入 `--upload` 和匹配的 `--confirm-appid` 才会真实上传。
- 不读取或输出密钥正文，日志中也不展示密钥路径。
- 不修改业务项目依赖，不在业务项目或全局环境安装 `miniprogram-ci`。
- 不负责体验版设置、提审、审核状态查询或正式发布。

> `miniprogram-ci@2.1.31` 的传递依赖仍包含上游尚未完全消除的 high/critical 风险。本项目仅覆盖已验证兼容的依赖补丁。请仅在受信环境中运行，不要擅自修改 `overrides`，也不要执行 `npm audit fix --force`。

## 目录结构

```text
wechat-miniprogram-ci-skill/
├── README.md
├── .gitignore
└── wechat-miniprogram-ci/       # 可安装的 Skill 目录
    ├── SKILL.md                 # 触发条件、执行流程和安全门禁
    ├── agents/openai.yaml       # Codex 界面元数据
    ├── references/setup.md      # 密钥、依赖和 uni-app 项目配置说明
    ├── scripts/upload-weixin.cjs
    ├── package.json
    └── package-lock.json
```

README 位于仓库根目录，避免将面向 GitHub 用户的辅助文档混入可安装的 Skill 目录。

## 前置条件

1. Node.js `^18.17.0 || >=20.5.0`，建议使用项目声明的 npm `10.9.2`。
2. 一个可正常执行生产构建的 uni-app 微信小程序项目。
3. 目标项目 `package.json` 中有有效的 `version`、`description`，以及默认的 `build:mp-weixin` 脚本；也可通过参数覆盖这些默认值。
4. 微信公众平台生成的代码上传密钥，以及按平台要求配置的上传 IP 白名单。
5. 将上传密钥保存在 Git 仓库外，并限制为仅当前用户可读；Linux/macOS 建议执行 `chmod 600 /path/to/upload.key`。

默认构建产物目录为 `dist/build/mp-weixin`，其中必须包含带合法 AppID 的 `project.config.json`。

## 安装到 Codex

推荐将仓库克隆到长期保留的位置，再把内层 Skill 目录链接到 Codex Skills 目录：

```bash
git clone git@github.com:liuy-byte/wechat-miniprogram-ci-skill.git /path/to/wechat-miniprogram-ci-skill

mkdir -p "${CODEX_HOME:-$HOME/.codex}/skills"
ln -s /path/to/wechat-miniprogram-ci-skill/wechat-miniprogram-ci \
  "${CODEX_HOME:-$HOME/.codex}/skills/wechat-miniprogram-ci"

cd /path/to/wechat-miniprogram-ci-skill/wechat-miniprogram-ci
CI=1 npm ci
```

安装时应指向内层 `wechat-miniprogram-ci/`，而不是仓库根目录。使用 `CI=1 npm ci` 可按锁文件安装依赖，并避免传递依赖误触发 Playwright 浏览器下载。

安装后重新启动 Codex 或开启新任务，使 Skill 被重新发现。

## 触发示例

可以在 Codex 中直接提出以下请求：

- “使用 `$wechat-miniprogram-ci` 预检并构建当前 uni-app 微信小程序。”
- “上传这个微信小程序的体验版代码，版本号是 `1.4.0`，描述是‘优化护理记录提交流程’。”
- “排查 `miniprogram-ci` 上传失败，先不要重新上传。”
- “为这个 uni-app 项目配置微信小程序 CI，只上传代码，不提审和发布。”

Skill 会先执行预检并展示项目、AppID、版本、描述、机器人、产物目录和依赖版本。请核对 AppID；只有明确确认后才会执行真实上传。

## 直接使用脚本

先在 Skill 目录安装依赖，并通过环境变量提供**仓库外密钥文件的路径**：

```bash
cd /path/to/wechat-miniprogram-ci-skill/wechat-miniprogram-ci
CI=1 npm ci
export WX_MINIPROGRAM_PRIVATE_KEY_PATH=/secure/path/upload.key
```

执行生产构建和预检，不上传代码：

```bash
node scripts/upload-weixin.cjs \
  --project /path/to/uni-app-project \
  --build \
  --version 1.4.0 \
  --desc "优化护理记录提交流程" \
  --robot 1
```

确认预检输出的 AppID 后，复用相同版本和描述执行上传：

```bash
node scripts/upload-weixin.cjs \
  --project /path/to/uni-app-project \
  --version 1.4.0 \
  --desc "优化护理记录提交流程" \
  --robot 1 \
  --upload \
  --confirm-appid wx0123456789abcdef
```

第二条命令默认复用已有生产产物；若需要重新构建，可再次增加 `--build`。完整参数可运行：

```bash
node scripts/upload-weixin.cjs --help
```

## 执行流程

1. 读取目标项目的开发说明，确认构建方式和项目约束。
2. 确定版本号和上传描述；版本号不得为空或为 `0.0.0`。
3. 校验仓库外密钥文件，不读取或显示密钥正文。
4. 按需执行微信小程序生产构建。
5. 检查产物目录、`project.config.json` 和 AppID，输出预检摘要。
6. 等待用户核对并明确确认 AppID。
7. 使用相同版本和描述上传代码，报告结果及可用的分包体积信息。

当目标项目提供可执行的 `bin/upload-weixin.local.sh` 时，Agent 工作流会优先使用该本地包装脚本并原样传参；包装脚本不属于本仓库，且不应读取、展示或复制其中的密钥配置。

## 配置说明

参数优先级为：命令行参数 > 环境变量 > 目标项目 `package.json`。

| 用途 | 命令行参数 | 环境变量 | 默认值/说明 |
| --- | --- | --- | --- |
| 目标项目 | `--project` | — | 当前目录 |
| 上传版本 | `--version` | `WX_MINIPROGRAM_VERSION` | `package.json.version` |
| 上传描述 | `--desc` | `WX_MINIPROGRAM_DESC` | `package.json.description` |
| 密钥文件路径 | `--private-key` | `WX_MINIPROGRAM_PRIVATE_KEY_PATH` | 无；推荐使用环境变量 |
| 预期 AppID | `--appid` | `WX_MINIPROGRAM_APPID` | 无；指定后必须与产物一致 |
| 机器人编号 | `--robot` | `WX_MINIPROGRAM_ROBOT` | `1`，允许 `1` 至 `30` |
| 构建脚本 | `--build-script` | — | `build:mp-weixin` |
| 产物目录 | `--output` | — | `dist/build/mp-weixin`，必须位于项目内 |

不要把密钥正文或真实密钥文件提交到仓库，也不要写入 `.env`、JSON、YAML、命令输出或上传描述。CI 流水线应将密钥保存在加密 Secret 中，运行时写入权限最小的临时文件，仅传递该文件路径，并在任务结束后删除。

## 验证

在 Skill 目录执行以下命令，可验证依赖、脚本语法和帮助输出：

```bash
CI=1 npm ci
npm ls miniprogram-ci
node --check scripts/upload-weixin.cjs
node scripts/upload-weixin.cjs --help
```

对真实业务项目，应先运行不带 `--upload` 的预检命令。预检通过并不产生外部上传动作。

## 常见问题

### 提示尚未安装 `miniprogram-ci`

进入内层 `wechat-miniprogram-ci/` 目录执行 `CI=1 npm ci`。不要在业务项目或全局环境安装该依赖。

### 找不到 `project.config.json`

增加 `--build` 执行生产构建，或检查 `--output` 是否指向微信生产产物。不要使用 H5 产物或 `dist/dev/mp-weixin`。

### AppID 不一致

脚本以构建产物 `project.config.json` 为准。核对目标环境、构建配置、`--appid` 与 `--confirm-appid`，不要在未确认目标小程序时强行上传。

### 密钥校验失败

确认传入的是有效普通文件。若密钥临时位于目标项目 Git 工作树内，它必须已被 `.gitignore` 忽略且未被 Git 跟踪；更推荐将其移到仓库外。若密钥曾被提交，请立即轮换。

### IP 白名单或权限错误

使用小程序管理员账号核对代码上传密钥、微信公众平台 IP 白名单和目标 AppID 权限。保留原始错误进行诊断，不要无诊断连续重试。

### `unable to get local issuer certificate`

先核对实际 Node.js 版本、系统 CA 和代理证书链。不要设置 `NODE_TLS_REJECT_UNAUTHORIZED=0` 绕过 TLS 校验。

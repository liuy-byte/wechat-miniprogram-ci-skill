---
name: wechat-miniprogram-ci
description: 使用微信官方 miniprogram-ci 对 uni-app 微信小程序执行发布前预检、生产构建和代码上传，并保护上传密钥、校验构建产物 AppID、要求真实上传前二次确认。用户要求构建或上传微信小程序、配置小程序 CI、上传体验版代码或排查 miniprogram-ci 上传失败时使用；只上传代码，不自动提审或发布。
---

# 微信小程序 CI

使用 `scripts/upload-weixin.cjs` 统一执行预检、构建和代码上传。默认只预检；只有用户确认目标 AppID 后才能真实上传。

## 执行流程

1. 读取目标项目的 `AGENTS.md` 或等价开发说明。
2. 确认目标是 uni-app 微信小程序生产产物，默认使用 `dist/build/mp-weixin`，不得把 H5 或开发产物当作上传目录。
3. 确定版本号：命令行参数 > `WX_MINIPROGRAM_VERSION` > `package.json.version`。禁止使用 `0.0.0`，不得根据改动自动猜测版本号。
4. 只生成一次上传描述：
   - 优先使用用户明确给出的描述，其次使用 `WX_MINIPROGRAM_DESC`。
   - 都没有时读取目标仓库的 `git status --short`、`git diff --stat`，必要时查看相关 diff，生成简洁具体的中文描述。
   - 无法从改动判断时才回退到 `package.json.description`。
   - 描述不得包含密钥、路径、Token、个人信息等敏感内容；预检和上传必须复用同一个 `--desc`。
5. 读取仓库外上传密钥路径。优先使用 `WX_MINIPROGRAM_PRIVATE_KEY_PATH`，不得读取或展示密钥正文。
6. 目标项目存在可执行的 `bin/upload-weixin.local.sh` 时优先调用它，并原样传入参数；不得读取、展示或复制 wrapper 中的密钥配置。否则直接调用本 Skill 脚本。
7. 缺少依赖或凭据时读取 [references/setup.md](references/setup.md)。运行依赖只安装在本 Skill 内，使用 `CI=1 npm ci`：避免 `less` 的传递依赖误触发 Playwright 浏览器下载，同时保留必要的生命周期脚本。不得修改业务项目依赖。
8. 先执行不带 `--upload` 的生产构建和预检：

```bash
node scripts/upload-weixin.cjs \
  --project /path/to/uni-app-project \
  --build \
  --desc "<本次上传描述>" \
  --robot 1
```

9. 展示项目、AppID、版本、描述、机器人、产物目录和依赖版本，建议用户核对 AppID。不得展示密钥路径或内容。
10. 用户明确确认 AppID 后，复用预检得到的版本和描述执行上传：

```bash
node scripts/upload-weixin.cjs \
  --project /path/to/uni-app-project \
  --version "<已确认版本>" \
  --desc "<预检使用的同一描述>" \
  --robot 1 \
  --upload \
  --confirm-appid "<预检得到的 AppID>"
```

11. 报告上传结果、版本和包体积。不得把“上传成功”表述为“已提审”或“已发布”。

## 安全门禁

- 不得把上传密钥写入 Skill、源码、`.env*`、命令输出或提交记录。
- 不得在业务项目或全局环境安装 `miniprogram-ci`。
- 密钥位于 Git 工作树内时，要求其已被忽略且未被跟踪；优先使用仓库外密钥。
- 不得从 `manifest.json` 推断版本号。
- 不得在未确认 AppID 时增加 `--upload`。
- 上传失败时保留原始错误并定位密钥、IP 白名单、AppID、产物、代理和证书链；不得无诊断连续重试。
- 遇到 `unable to get local issuer certificate` 时优先核对实际 Node 版本并使用系统 CA；不得设置 `NODE_TLS_REJECT_UNAUTHORIZED=0`。

## 参数与环境变量

运行 `node scripts/upload-weixin.cjs --help` 查看完整参数。常用环境变量：

- `WX_MINIPROGRAM_PRIVATE_KEY_PATH`
- `WX_MINIPROGRAM_APPID`
- `WX_MINIPROGRAM_VERSION`
- `WX_MINIPROGRAM_DESC`
- `WX_MINIPROGRAM_ROBOT`

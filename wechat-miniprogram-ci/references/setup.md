# 微信小程序 CI 配置

## 前置条件

1. 使用小程序管理员账号在微信公众平台生成代码上传密钥。
2. 按微信平台要求配置代码上传 IP 白名单。
3. 把密钥保存在仓库外，并设置为仅当前用户可读。
4. 在 Skill 根目录安装锁定依赖：

```bash
CI=1 npm ci
```

使用 `CI=1` 可避免 `less` 的传递依赖误触发 Playwright 浏览器下载，同时保留 `miniprogram-ci` 所需的生命周期脚本。依赖固定为微信官方 `miniprogram-ci 2.1.31`；本 Skill 使用 npm 10，要求 Node.js `^18.17.0 || >=20.5.0`。升级前先核对[微信官方 CI 文档](https://developers.weixin.qq.com/miniprogram/dev/devtools/ci.html)和[npm 包](https://www.npmjs.com/package/miniprogram-ci)。

## 上游依赖风险

微信官方 `miniprogram-ci@2.1.31` 的传递依赖仍包含 high 和 critical 风险，当前没有上游提供的无风险替代版本。本 Skill 仅覆盖已验证为兼容补丁的 `minimatch`、`terser`、`form-data` 和 `qs`；其余需要跨主版本或无修复版本的依赖保持官方依赖树，避免破坏上传能力。仅在受信环境中运行本 Skill，使用最小权限账号，并把上传密钥保存在仓库外。持续关注微信官方版本更新；不得擅自修改 `overrides` 或运行 `npm audit fix --force`。

## 本地密钥

优先通过环境变量传递仓库外路径：

```bash
export WX_MINIPROGRAM_PRIVATE_KEY_PATH="$HOME/.config/wechat-miniprogram-ci/upload.key"
```

如果密钥临时位于项目目录，必须先加入 `.gitignore` 并确认未被 Git 跟踪。不要把私钥正文放入 `.env`、JSON、YAML、Skill 或日志。

## 流水线密钥

把密钥正文保存到流水线加密 Secret。任务运行时写入权限最小的临时文件，把文件路径传给 `WX_MINIPROGRAM_PRIVATE_KEY_PATH`，任务结束后删除。不要把 Secret 拼进命令参数或输出。

## uni-app 项目要求

目标项目的 `package.json` 至少包含有效版本、描述和微信生产构建脚本：

```json
{
  "version": "1.0.0",
  "description": "默认上传说明",
  "private": true,
  "scripts": {
    "build:mp-weixin": "uni build -p mp-weixin"
  }
}
```

默认上传目录是 `dist/build/mp-weixin`，其中必须包含 `project.config.json`。脚本从构建产物读取 AppID；若同时指定预期 AppID，两者必须一致。

## 能力边界

`miniprogram-ci.upload()` 只把代码上传到微信小程序后台。体验版设置、提交审核、查询审核状态和正式发布不属于本 Skill 的自动操作范围。

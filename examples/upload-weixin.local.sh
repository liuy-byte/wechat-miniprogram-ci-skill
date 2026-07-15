#!/usr/bin/env bash
#
# 项目本地包装脚本模板（wrapper）。
#
# 作用：注入本机「仓库外」上传密钥与预期 AppID，定位本 Skill 的 CI 脚本，并把其余参数原样透传。
# 该 wrapper 属于「目标项目」，不属于本 Skill 仓库；每个使用者按自己的环境改动下方两处配置即可。
#
# 用法：
#   1. 把本文件复制到目标项目的 bin/upload-weixin.local.sh 并赋可执行权限（chmod +x）。
#   2. 按“需要修改”注释改好密钥路径与 AppID（或改为完全从环境变量传入）。
#   3. 根据 Skill 实际存放位置设置 SKILL_DIR。
#   4. 调用示例：
#        ./bin/upload-weixin.local.sh --build --desc "本次上传描述" --robot 1                # 预检
#        ./bin/upload-weixin.local.sh --build --desc "本次上传描述" --robot 1 \
#          --upload --confirm-appid <appid> --bump patch                                     # 确认后上传并升版本号
#
# 安全提示：上传密钥必须放在 Git 仓库外并 chmod 600，绝不提交进任何仓库。

set -Eeuo pipefail

# 相对自身定位项目根目录（不依赖当前工作目录）。
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
PROJECT_ROOT="$(cd -- "${SCRIPT_DIR}/.." && pwd -P)"

# ── 需要修改 ①：本 Skill 的存放目录 ──────────────────────────────
# 允许用环境变量 WX_CI_SKILL_DIR 覆盖；否则用下面的默认值。
# 常见几种放法（按实际选一种）：
#   - 项目自带一份：   "${PROJECT_ROOT}/tools/wechat-miniprogram-ci"
#   - 工作区共享一份： "${PROJECT_ROOT}/../.agents/skills/wechat-miniprogram-ci"
#   - 本机固定位置：   "$HOME/tools/wechat-miniprogram-ci"
SKILL_DIR="${WX_CI_SKILL_DIR:-${PROJECT_ROOT}/tools/wechat-miniprogram-ci}"
CI_SCRIPT="${SKILL_DIR}/scripts/upload-weixin.cjs"

# ── 需要修改 ②：仓库外密钥路径与预期 AppID ───────────────────────
# 优先用调用者已导出的同名环境变量；否则用下面的默认值（把占位符改成你自己的）。
export WX_MINIPROGRAM_PRIVATE_KEY_PATH="${WX_MINIPROGRAM_PRIVATE_KEY_PATH:-$HOME/wx-keys/private.<你的appid>.key}"
export WX_MINIPROGRAM_APPID="${WX_MINIPROGRAM_APPID:-<你的appid>}"

if [[ ! -f "${CI_SCRIPT}" ]]; then
  printf '错误：找不到微信小程序 CI 脚本：%s\n' "${CI_SCRIPT}" >&2
  printf '请确认 SKILL_DIR 指向正确，并已在该目录执行 CI=1 npm ci 安装依赖。\n' >&2
  exit 1
fi

exec node "${CI_SCRIPT}" --project "${PROJECT_ROOT}" "$@"

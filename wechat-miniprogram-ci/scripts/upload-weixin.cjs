#!/usr/bin/env node

'use strict'

const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const SKILL_ROOT = path.resolve(__dirname, '..')

const HELP = `微信小程序代码上传（默认仅预检）

用法：
  node upload-weixin.cjs --project <目录> [选项]

基础参数：
  --project <目录>         uni-app 项目根目录，默认当前目录
  --version <版本>         上传版本号，默认读取 package.json.version
  --desc <描述>            上传描述，默认读取 package.json.description
  --private-key <路径>     微信代码上传密钥；也可用 WX_MINIPROGRAM_PRIVATE_KEY_PATH

可选参数：
  --build                  先执行生产构建
  --build-script <名称>    构建脚本，默认 build:mp-weixin
  --output <目录>          产物目录，默认 dist/build/mp-weixin
  --appid <AppID>          预期 AppID；也可用 WX_MINIPROGRAM_APPID
  --robot <1-30>           CI 机器人编号，默认 1
  --upload                 执行真实上传；不传时仅预检
  --confirm-appid <AppID>  真实上传时必需，必须与产物 AppID 一致
  --help                   显示帮助

环境变量：
  WX_MINIPROGRAM_PRIVATE_KEY_PATH
  WX_MINIPROGRAM_APPID
  WX_MINIPROGRAM_VERSION
  WX_MINIPROGRAM_DESC
  WX_MINIPROGRAM_ROBOT

版本与描述优先级：命令行参数 > 环境变量 > package.json
`

function fail(message) {
  console.error(`错误：${message}`)
  process.exit(1)
}

function warn(message) {
  console.warn(`警告：${message}`)
}

function parseArgs(argv) {
  const booleanFlags = new Set(['--build', '--upload', '--help'])
  const knownValueFlags = new Set([
    '--project',
    '--version',
    '--desc',
    '--private-key',
    '--build-script',
    '--output',
    '--appid',
    '--robot',
    '--confirm-appid'
  ])
  const result = {}

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (booleanFlags.has(argument)) {
      result[argument.slice(2)] = true
      continue
    }
    if (!knownValueFlags.has(argument)) {
      fail(`未知参数 ${argument}，使用 --help 查看帮助`)
    }
    const value = argv[index + 1]
    if (!value || value.startsWith('--')) {
      fail(`参数 ${argument} 缺少值`)
    }
    result[argument.slice(2)] = value
    index += 1
  }

  return result
}

function readJson(filePath, label) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'))
  } catch (error) {
    fail(`无法读取${label} ${filePath}：${error.message}`)
  }
}

function isInside(parent, child) {
  const relative = path.relative(parent, child)
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
}

function commandExists(command) {
  const result = spawnSync(command, ['--version'], { stdio: 'ignore' })
  return result.status === 0
}

function detectPackageManager(projectRoot, projectPackage) {
  if (Object.prototype.hasOwnProperty.call(projectPackage, 'packageManager')) {
    const packageManager = projectPackage.packageManager
    if (typeof packageManager !== 'string' || !/^(pnpm|npm|yarn)@\S+$/.test(packageManager)) {
      fail('package.json.packageManager 必须是 pnpm@版本、npm@版本或 yarn@版本')
    }

    const selected = packageManager.slice(0, packageManager.indexOf('@'))
    if (!commandExists(selected)) {
      fail(`package.json 指定了 ${packageManager}，但未找到构建工具 ${selected}`)
    }
    return selected
  }

  const candidates = [
    ['pnpm', 'pnpm-lock.yaml'],
    ['npm', 'package-lock.json'],
    ['yarn', 'yarn.lock']
  ].filter(([, lockfile]) => fs.existsSync(path.join(projectRoot, lockfile)))

  const selected = candidates.find(([name]) => name === 'pnpm') || candidates[0] || ['npm']
  if (candidates.length > 1) {
    warn(`发现多个依赖锁文件：${candidates.map(([, lockfile]) => lockfile).join('、')}；将使用 ${selected[0]}`)
  }

  if (!commandExists(selected[0])) {
    fail(`未找到构建工具 ${selected[0]}`)
  }
  return selected[0]
}

function runBuild(projectRoot, scriptName, packageManager) {
  const args = packageManager === 'npm' ? ['run', scriptName] : ['run', scriptName]
  console.log(`开始构建：${packageManager} ${args.join(' ')}`)
  const result = spawnSync(packageManager, args, {
    cwd: projectRoot,
    stdio: 'inherit',
    env: process.env
  })
  if (result.status !== 0) {
    fail(`构建失败，退出码 ${result.status ?? '未知'}`)
  }
}

function getGitRoot(projectRoot) {
  const result = spawnSync('git', ['-C', projectRoot, 'rev-parse', '--show-toplevel'], {
    encoding: 'utf8'
  })
  return result.status === 0 ? path.resolve(result.stdout.trim()) : null
}

function validatePrivateKey(projectRoot, privateKeyPath) {
  if (!fs.existsSync(privateKeyPath) || !fs.statSync(privateKeyPath).isFile()) {
    fail('上传密钥文件不存在或不是普通文件')
  }
  if (fs.statSync(privateKeyPath).size === 0) {
    fail('上传密钥文件为空')
  }

  const gitRoot = getGitRoot(projectRoot)
  if (gitRoot && isInside(gitRoot, privateKeyPath)) {
    const relativePath = path.relative(gitRoot, privateKeyPath)
    const tracked = spawnSync('git', ['-C', gitRoot, 'ls-files', '--error-unmatch', '--', relativePath], {
      stdio: 'ignore'
    })
    if (tracked.status === 0) {
      fail('上传密钥已被 Git 跟踪，请立即移出仓库并轮换该密钥')
    }
    const ignored = spawnSync('git', ['-C', gitRoot, 'check-ignore', '-q', '--', relativePath], {
      stdio: 'ignore'
    })
    if (ignored.status !== 0) {
      fail('上传密钥位于 Git 工作树内但未被 .gitignore 忽略')
    }
  }

  if (process.platform !== 'win32') {
    const mode = fs.statSync(privateKeyPath).mode & 0o777
    if ((mode & 0o077) !== 0) {
      warn('上传密钥文件可被其他用户读取，建议执行 chmod 600')
    }
  }
}

function resolveMiniprogramCi() {
  let packageJsonPath
  try {
    packageJsonPath = require.resolve('miniprogram-ci/package.json', { paths: [SKILL_ROOT] })
  } catch {
    fail('Skill 尚未安装 miniprogram-ci；请在 Skill 目录执行 CI=1 npm ci')
  }

  const packageJson = readJson(packageJsonPath, 'miniprogram-ci package.json')
  const major = Number.parseInt(String(packageJson.version).split('.')[0], 10)
  if (!Number.isInteger(major) || major < 2) {
    fail(`miniprogram-ci ${packageJson.version} 版本过旧，请评估并升级到 2.x`)
  }

  const modulePath = require.resolve('miniprogram-ci', { paths: [SKILL_ROOT] })
  return { ci: require(modulePath), version: packageJson.version }
}

function validateNodeVersion() {
  const [major, minor] = process.versions.node.split('.').map(Number)
  if (major < 16 || (major === 16 && minor < 1)) {
    fail(`Node.js ${process.versions.node} 不满足 miniprogram-ci 2.x 的最低要求 >=16.1.0`)
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    console.log(HELP)
    return
  }

  validateNodeVersion()

  const projectRoot = path.resolve(args.project || process.cwd())
  const outputPath = path.resolve(projectRoot, args.output || 'dist/build/mp-weixin')
  const buildScript = args['build-script'] || 'build:mp-weixin'
  const expectedAppid = args.appid || process.env.WX_MINIPROGRAM_APPID
  const privateKeyValue = args['private-key'] || process.env.WX_MINIPROGRAM_PRIVATE_KEY_PATH
  const robotValue = args.robot || process.env.WX_MINIPROGRAM_ROBOT || '1'
  const robot = Number.parseInt(robotValue, 10)

  if (!fs.existsSync(projectRoot) || !fs.statSync(projectRoot).isDirectory()) {
    fail(`项目目录不存在：${projectRoot}`)
  }
  if (!isInside(projectRoot, outputPath)) {
    fail('产物目录必须位于项目目录内')
  }

  const projectPackagePath = path.join(projectRoot, 'package.json')
  if (!fs.existsSync(projectPackagePath)) {
    fail('项目目录缺少 package.json')
  }
  const projectPackage = readJson(projectPackagePath, '项目 package.json')
  const version = args.version || process.env.WX_MINIPROGRAM_VERSION || projectPackage.version
  const desc = args.desc || process.env.WX_MINIPROGRAM_DESC || projectPackage.description
  if (args.build && !projectPackage.scripts?.[buildScript]) {
    fail(`package.json 中不存在构建脚本 ${buildScript}`)
  }

  if (!version || version.trim() === '' || version === '0.0.0') {
    fail('缺少有效上传版本号；请传入 --version、设置 WX_MINIPROGRAM_VERSION，或完善 package.json.version')
  }
  if (version.length > 64) {
    fail('上传版本号不能超过 64 个字符')
  }
  if (!desc || desc.trim() === '') {
    fail('缺少上传描述；请传入 --desc、设置 WX_MINIPROGRAM_DESC，或完善 package.json.description')
  }
  if (!Number.isInteger(robot) || String(robot) !== String(robotValue) || robot < 1 || robot > 30) {
    fail('CI 机器人编号必须是 1 到 30 的整数')
  }
  if (!privateKeyValue) {
    fail('缺少上传密钥路径；请传入 --private-key 或设置 WX_MINIPROGRAM_PRIVATE_KEY_PATH')
  }

  const privateKeyPath = path.resolve(privateKeyValue)
  validatePrivateKey(projectRoot, privateKeyPath)
  const { ci, version: ciVersion } = resolveMiniprogramCi()

  let packageManager = null
  if (args.build) {
    packageManager = detectPackageManager(projectRoot, projectPackage)
    runBuild(projectRoot, buildScript, packageManager)
  }

  const projectConfigPath = path.join(outputPath, 'project.config.json')
  if (!fs.existsSync(projectConfigPath)) {
    fail(`产物缺少 project.config.json：${outputPath}；请先增加 --build 或检查产物目录`)
  }
  const projectConfig = readJson(projectConfigPath, '构建产物 project.config.json')
  const artifactAppid = projectConfig.appid
  if (!artifactAppid || !/^wx[0-9a-f]{16}$/i.test(artifactAppid)) {
    fail('构建产物中缺少合法的微信小程序 AppID')
  }
  if (expectedAppid && expectedAppid !== artifactAppid) {
    fail(`指定 AppID 与构建产物不一致：指定 ${expectedAppid}，产物 ${artifactAppid}`)
  }

  console.log('\n预检通过')
  console.log(`项目：${projectPackage.name || path.basename(projectRoot)}`)
  console.log(`AppID：${artifactAppid}`)
  console.log(`版本：${version}`)
  console.log(`描述：${desc}`)
  console.log(`机器人：${robot}`)
  console.log(`产物：${outputPath}`)
  console.log(`miniprogram-ci：${ciVersion}`)
  console.log('密钥：已校验（不显示路径和内容）')

  if (!args.upload) {
    console.log('\n当前为预检模式，未上传代码。')
    return
  }

  if (!args['confirm-appid']) {
    fail('真实上传必须传入 --confirm-appid')
  }
  if (args['confirm-appid'] !== artifactAppid) {
    fail(`确认 AppID 不匹配：确认 ${args['confirm-appid']}，产物 ${artifactAppid}`)
  }

  console.log('\n开始上传微信小程序代码…')
  const project = new ci.Project({
    appid: artifactAppid,
    type: 'miniProgram',
    projectPath: outputPath,
    privateKeyPath,
    ignores: ['node_modules/**/*']
  })
  const result = await ci.upload({
    project,
    version,
    desc,
    robot,
    setting: { useProjectConfig: true }
  })

  console.log(`上传成功：${artifactAppid} ${version}`)
  if (Array.isArray(result?.subPackageInfo)) {
    for (const item of result.subPackageInfo) {
      if (typeof item?.size === 'number') {
        console.log(`包体 ${item.name}：${(item.size / 1024).toFixed(2)} KiB`)
      }
    }
  }
}

main().catch((error) => {
  console.error(`上传失败：${error?.message || String(error)}`)
  process.exit(1)
})

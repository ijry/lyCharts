# uin-app-x

用于在独立 `uni-app x` 工程中测试本地 `lyCharts`。

## 运行

使用 HBuilderX 打开本目录，运行到 Android / iOS / Harmony。

### 命令行运行到 Android 模拟器

本工程 `package.json` 没有 CLI 构建脚本，只能通过 HBuilderX 编译。要在命令行把 uvue 改动重新编译部署到模拟器，使用 HBuilderX CLI（Windows 默认位于 `C:\ProgramData\HBuilderX\cli.exe`）：

```bash
cli.exe launch app-android --project uin-app-x
```

前置条件：

- HBuilderX 需已启动（`cli.exe open` 可启动）。
- 工程需已导入 HBuilderX，`cli.exe project list` 可查看已导入工程。
- 模拟器 / 真机需已连接，可用 `adb devices` 确认。
- 首次编译较慢，建议后台运行。

常用参数：`--cleanCache true`（清理构建缓存，仅 uni-app x 生效）、`--compile true`（仅编译不运行）、`--native-log true`（输出原生日志）。

> 注意：`uni_modules/ly-charts` 下的 uvue / uts 改动不会热更新，必须整包重新编译才会在设备上生效。改完后重新执行上面的运行命令，再用 `adb exec-out screencap` 截图验证。

## 本地插件

`uni_modules/ly-charts` 是目录联接，指向仓库根项目的 `src/uni_modules/ly-charts`，可直接测试本地修改。

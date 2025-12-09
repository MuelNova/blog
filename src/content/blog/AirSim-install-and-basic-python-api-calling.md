---
title: AirSim的初步配置与Python API调用
description: nova在这篇文章中详细介绍了如何在Windows系统上配置和使用AirSim，以帮助读者实现模拟无人机控制。
pubDate: 2021-12-31
tags:
- AirSim
- investigate
authors:
- nova
---

（因为找不到相关logo所以偷了个banner_img()）
# Build AirSim on Windows

### 安装 Unreal Engine 4

1. 下载 [Epic Games Launcher](https://www.unrealengine.com/zh-CN/download)
2. 运行 Epic Games Launcher, 下载**Unreal Engine 4 >= 4.25**的版本

<!--truncate-->

### 编译 AirSim
#### 准备工作

安装[Visual Studio 2019](https://visualstudio.microsoft.com/zh-hans/), 并安装 **Desktop Development with C++**  和 **Windows 10 SDK >= 10.0.18362**（默认自动勾选）

#### 开始编译


1. 通过```git clone https://github.com/microsoft/AirSim.git```将AirSim克隆到本地
2. 使用 **Developer Command Prompt for VS 2019** 并进入 AirSim 目录, 运行`build.cmd`

## 创建 Unreal 项目

> [Microsoft 官方教程与解释](https://microsoft.github.io/AirSim/unreal_custenv/)

AirSim 自带了 "Blocks Enviroment" 可以使用，不过我们选择创建自己的 Unreal Environment

- 在 Epic Games Launcher 中选择 "学习" 并下载 "山脉景观"（当然我们也可以选择其他的）。

- 点击```文件```,新建一个```C++类```, 使用默认名称并创建类。

- 复制 ```%PATH%/AirSim/Unreal/Plugins```到项目目录。

  > 如果你找不到Plugins，则请使用 Developer Command Prompt for VS 2019 在 ```%PATH%/AirSim/Unreal/Environments\Blocks``` 下运行 ```update_to_git.bat```

- 编辑`%Projects%.uproject`, 添加`AdditionalDependencies`和`Plugins`, 在这之后你的文件应该看上去像这个样子。

  ```json
  {
      "FileVersion": 3,
      "EngineAssociation": "4.27",
      "Category": "Samples",
      "Description": "",
      "Modules": [
          {
              "Name": "LandscapeMountains",
              "Type": "Runtime",
              "LoadingPhase": "Default",
              "AdditionalDependencies": [
                  "AirSim"
              ]
          }
      ],
      "TargetPlatforms": [
          "MacNoEditor",
          "WindowsNoEditor"
      ],
      "Plugins": [
          {
              "Name": "AirSim",
              "Enabled": true
          }
      ]
  }
  ```


- 右键`%Project%.uproject`文件并选择`Generate Visual Studio Project Files`。
- 使用VS打开`%Project%.sln`文件, 选择 "DebugGame Editor"和"Win64" 作为编译参数并运行。
- 现在你应该已经可以在你自己的Unreal环境中使用AirSim, 记得保存你的设置！

# Run Python API

在本文下，我所使用的环境是 Conda + Python3.8

先进行包的安装

```
 pip install msgpack-rpc-python
 pip install airsim
```

先对无人机进行最简单的控制
> 需要先获取无人机Client之后启用API控制, 同时你需要解锁无人机

使用`.join()`对无人机使用 `Async` 方法进行控制
否则在无人机动作未完成之前就执行下一动作

最简单的例子:
```python
import airsim

client = airsim.MultirotorClient()  # 连接到无人机
client.enableApiControl(True)       # 获取控制权
client.armDisarm(True)              # 解锁
client.takeoffAsync().join()        # 起飞
client.landAsync(),join()           # 降落
client.armDisarm(False)             
client.enableApiControl(False)
```

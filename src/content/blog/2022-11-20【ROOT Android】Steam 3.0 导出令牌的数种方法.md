---
title: 【ROOT Android】Steam 3.0 导出令牌的数种方法
description: 在 Steam 更新至 3.0 版本后，原本在 2.X 版本下导出 Steam 令牌的方法不再有效。博主 nova 通过逆向分析和补丁，总结了数种新的在
  3.0 版本下导出令牌的方法。这些方法都是基于使用已 ROOT 的 Android 设备。
pubDate: 2022-11-20
tags:
- Reverse
- investigate
authors:
- nova
---

# 【ROOT Android】Steam 3.0 导出令牌的数种方法

在 Steam 更新 3.0 版本之后，原本 2.X 版本下导出令牌的方法已经不再可用。于是我花了一点时间逆向 + Patch，总结出了数个在 Steam 3.0 版本下导出令牌的方法。当然，这些方法的所有前提都是：拥有一台已经 ROOT 过的设备。

<!--truncate-->

## 0x01 什么被改变了

与 2.X 版本最大的不同是，Steam 3.0 版本使用了 React Native 作为框架来编写，这让我们的逆向分析困难了不少。React 打包之后的 `index.android.bundle` 是晦涩难懂的，对于程序流的分析花费了我大量的时间。

就令牌这一方面而言，结论是这样的：

令牌被序列化成类似下文的结构，

```json
{
    "accounts": {
        "<your_steam_64_id>": {
            "steamguard_scheme": "2",
      		"uri": "<...>",
      		"status": 1,
      		"identity_secret": "<...>",
      		"revocation_code": "<...>",
      		"token_gid": "<...>",
      		"account_name": "<...>",
             "serial_number": "<...>",
             "server_time": "<...>",
             "secret_1": "<...>",
             "steamid": "<your_steam_64_id>",
             "phone_number_hint": "<last_4_numbers_of_your_phone_number>",
             "shared_secret": "<...>"
        },
        "<another_steam_64_id>": {
            "steamguard_scheme": "2",
      		"uri": "<...>",
      		"status": 1,
      		"identity_secret": "<...>",
      		"revocation_code": "<...>",
      		"token_gid": "<...>",
      		"account_name": "<...>",
             "serial_number": "<...>",
             "server_time": "<...>",
             "secret_1": "<...>",
             "steamid": "<another_steam_64_id>",
             "phone_number_hint": "<last_4_numbers_of_your_phone_number>",
             "shared_secret": "<...>"
        },
        ...
    }
}
```

并通过 `android.KeyStone` 的相关方法，进行 `AES` 加密后储存于 `/data/data/com.valvesoftware.android.steam.community/shared_prefs/SecureStore.xml` 的 `<string name="SteamGuard_1">` 标签下。

这个标签的内容格式如下：

```json
{
    "ct": "BASE64_ENCODED_CONTENT_OF_AES_ENCRYPED_STEAM_GUARD_JSON",
    "iv": "BASE64_ENCODED_IV",
    "tlen": 128,
    "scheme": "aes"
}
```

由于 `android.KeyStone` 的安全性，想要通过逆向 `SecretKey` 并解密这些密文几乎是不可能的（至少我尝试了很久也没有做到），因此，我们不得不考虑其它的方法进行导出。



## 0x02 【推荐】通过 Frida Hook `Cipher.doFinal` 方法

这个方法的前提是：

1. 按照 [Doc](https://frida.re/docs/android/) 配置并运行 Android Frida Server，在 USB 调试模式 开启的条件下使用 USB 连接设备。
2. 拥有一个安装了 `frida` 模块的 Python 环境

只需运行下面的脚本，即可在标准输出中获取令牌。

```python
import json
import frida
import sys

package = "com.valvesoftware.android.steam.community"
cmd = """
'use strict;'

if (Java.available) {
  Java.perform(function() {

    //Cipher stuff
    const Cipher = Java.use('javax.crypto.Cipher');

    Cipher.doFinal.overload('[B').implementation = function (input) {
        var result = this.doFinal.overload('[B').call(this, input);
        send(result);
    }

  }
)}
"""


def parse_hook(cmd_):
    print('[*] Parsing hook...')
    script = session.create_script(cmd_)
    script.on('message', on_message)
    script.load()


def on_message(message, _):
    try:
        if message:
            if message['type'] == 'send':
                result = "".join(chr(i) for i in message['payload'])
                print(json.dumps(json.loads(result), indent=2, ensure_ascii=False))
    except Exception as e:
        print(e)


if __name__ == '__main__':
    try:
        print('[*] Spawning ' + package)
        pid = frida.get_usb_device().spawn(package)
        session = frida.get_usb_device().attach(pid)
        parse_hook(cmd)
        frida.get_usb_device().resume(pid)
        print('')
        sys.stdin.read()

    except KeyboardInterrupt:
        sys.exit(0)
    except Exception as e:
        print(e)

```

这个方法是简单的，通过劫持 `Cipher.doFinal` 方法，将解密后的结果返回，这样做的好处是不需要侵入程序，且较为容易设置。



## 0x03 通过 Javascript 注入修改 `React Native` 代码

这个方法的前提是：

1. 在 USB 调试模式 开启的条件下使用 USB 连接设备。
2. 设备可以绕过签名冲突安装应用，关于这点，可以利用 Xposed 插件 [CorePatch](https://github.com/LSPosed/CorePatch) 

步骤如下：

- 以压缩包格式打开 `steam.apk`，并将 `assests/index.android.bundle` 解压到任意位置。
- 使用诸如 `vscode` 等的编辑器打开 `index.android.bundle` 
- (Optional) 格式化代码以方便分析
- 搜索 `key: "GetSteamGuardInfo"`，并在 `value` 对应的 `function` 内，在 `return` 上方加入下面的代码

```javascript
                this.m_mapGuardInfo.forEach(function (t, n) {
                  console.error(n);
                  console.error(JSON.stringify(t));
                });
```

修改完之后的这部分应该是这个样子的：

```javascript
            {
              key: "GetSteamGuardInfo",
              value: function (t) {
                this.m_mapGuardInfo.forEach(function (t, n) {
                  console.error(n);
                  console.error(JSON.stringify(t));
                });
                return this.m_mapGuardInfo.has(t)
                  ? this.m_mapGuardInfo.get(t)
                  : null;
              },
            },
```

- 将修改完的 `index.android.bundle` 复制回 `steam.apk` 内的 `assests/` 
- 使用 `adb install -r steam.apk` 安装程序
- 在命令行内输入下面的代码

```bash
adb logcat *:S ReactNative:V ReactNativeJS:V\
```

- 打开新安装的 `steam.apk`，切换到令牌页时，你应该能在命令行的标准输出内看到你的所有令牌了。



## 0x04 降级安装 Steam 2.X 生成令牌并导出后再次升级

一般来说，降级安装是不被允许的，关于这点，你也可以使用 Xposed 插件 [CorePatch](https://github.com/LSPosed/CorePatch) 

这里值得一提的点是：在 `/data/data/com.valvesoftware.android.steam.community/databases/RkStorage.db` 这个数据库中，表中存在一个 `bMigrated` 键，用以确定是否需要对令牌进行 `migration`操作。



## 0x05 抓包

详情可以看 [iOS 3.x新版Steam抓包导出令牌方法 - 免越狱免降级免备份](https://github.com/BeyondDimension/SteamTools/issues/2129)

安卓版本的操作是大同小异的，可以通过搜索 "如何使用 Fiddler （或是其他抓包软件）在 Android 抓取 HTTPS 请求" 获取更多内容。

然而需要注意的是：新的安卓系统拥有一个称为证书锁定（`ssl pinning`）的机制，这让应用程序抓包十分困难。

我尝试了 Xposed 插件 [JustTrustMe](https://github.com/Fuzion24/JustTrustMe) 以及 [TrustMeAlready](https://github.com/ViRb3/TrustMeAlready)，但是它们都不起作用。最后，我的解决方法是使用 [
android-SSL-unpinning](https://github.com/ryanking13/android-SSL-unpinning) 重新打包 `steam.apk`才抓取到了请求。



## 0x06 总结

这篇文章的重点除了在探讨如何导出令牌外，也在于给予更多人逆向的思路，从而创建出更方便的工具（如：第三方扫码登陆平台），这个工作本身难度是很低的，但是却十分繁琐，如果这篇文章能帮各位省下一些前期工作的时间，那就再好不过了。

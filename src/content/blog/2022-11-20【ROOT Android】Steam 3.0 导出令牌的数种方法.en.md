---
title: 【ROOT Android】Steam 3.0 导出令牌的数种方法
description: 在 Steam 更新至 3.0 版本后，原本在 2.X 版本下导出 Steam 令牌的方法不再有效。博主 nova 通过逆向分析和补丁，总结了数种新的在
  3.0 版本下导出令牌的方法。这些方法都是基于使用已 ROOT 的 Android 设备。
pubDate: 2022-11-20
tags:
- Reverse
- Investigate
authors:
- nova

---
# 【ROOT Android】Multiple Methods to Export Tokens in Steam 3.0

After the update to version 3.0, the methods for exporting tokens in Steam that worked in the 2.X version are no longer applicable. So I spent some time on reverse engineering and patching, and summarized several methods to export tokens in Steam version 3.0. Of course, all these methods require one precondition: having a rooted device.

{/* truncate */}

## 0x01 What Has Changed

The biggest difference from the 2.X version is that Steam version 3.0 is written using React Native as the framework, making reverse analysis more difficult. The React packaged `index.android.bundle` is obscure, which consumed a lot of my time to analyze the program flow.

Regarding tokens, the conclusion is as follows:

Tokens are serialized into structures similar to the following:

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

And after AES encryption using the relevant methods of `android.KeyStone`, they are stored under the `<string name="SteamGuard_1">` tag in `/data/data/com.valvesoftware.android.steam.community/shared_prefs/SecureStore.xml`.

The format of the content of this tag is as follows:

```json
{
    "ct": "BASE64_ENCODED_CONTENT_OF_AES_ENCRYPTED_STEAM_GUARD_JSON",
    "iv": "BASE64_ENCODED_IV",
    "tlen": 128,
    "scheme": "aes"
}
```

Due to the security of `android.KeyStone`, it is almost impossible to reverse the `SecretKey` and decrypt these ciphertexts (at least I tried for a long time and failed), so we have to consider other methods for exporting.



## 0x02 【Recommended】Using Frida to Hook `Cipher.doFinal` Method

The prerequisites for this method are:

1. Configure and run the Android Frida Server according to the [Doc](https://frida.re/docs/android/), and connect the device via USB debugging mode.
2. Have a Python environment with the `frida` module installed

Simply run the script below to retrieve tokens in the standard output.

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

This method is simple; by hijacking the `Cipher.doFinal` method, the decrypted results are returned, eliminating the need to invade the program and relatively easy to set up.



## 0x03 Modifying `React Native` Code through JavaScript Injection

The prerequisites for this method are:

1. Use a USB-connected device with USB debugging mode enabled.
2. The device can install applications to bypass signature conflicts. For this, you can use the Xposed plugin [CorePatch](https://github.com/LSPosed/CorePatch)

The steps are as follows:

- Open `steam.apk` in compressed format and extract `asstes/index.android.bundle` to any location.
- Open `index.android.bundle` with an editor like `vscode`.
- (Optional) Format the code for easier analysis.
- Search for `key: "GetSteamGuardInfo"` and add the following code above the `return` within the corresponding `function` value:

```javascript
                this.m_mapGuardInfo.forEach(function (t, n) {
                  console.error(n);
                  console.error(JSON.stringify(t));
                });
```

After modifying, this section should look like this:

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

- Copy the modified `index.android.bundle` back to `assests/` in `steam.apk`.
- Install the program using `adb install -r steam.apk`.
- Enter the following command in the command line:

```bash
adb logcat *:S ReactNative:V ReactNativeJS:V\
```

- Open the newly installed `steam.apk`, and when switching to the token page, you should see all your tokens in the standard output of the command line.



## 0x04 Downgrade, Install Steam 2.X, Generate Tokens, Export, and Upgrade Again

Generally, downgrading installations are not allowed. For this, you can use the Xposed plugin [CorePatch](https://github.com/LSPosed/CorePatch)

It is worth mentioning that in the database `/data/data/com.valvesoftware.android.steam.community/databases/RkStorage.db`, there is a key `bMigrated` in the table to determine if token migration operations are required.



## 0x05 Packet Capture

For details, refer to [iOS 3.x新版Steam抓包导出令牌方法 - 免越狱免降级免备份](https://github.com/BeyondDimension/SteamTools/issues/2129).

The operations in the Android version are similar, and you can search "how to capture HTTPS requests on Android using Fiddler (or other packet capture software)" to find more information.

However, note that newer Android systems have a mechanism called certificate pinning (`ssl pinning`), making it very difficult to capture packets from applications.

I tried Xposed plugins [JustTrustMe](https://github.com/Fuzion24/JustTrustMe) and [TrustMeAlready](https://github.com/ViRb3/TrustMeAlready), but they did not work. Finally, I was able to capture requests by using [android-SSL-unpinning](https://github.com/ryanking13/android-SSL-unpinning) to repackage `steam.apk`.



## 0x06 Conclusion

In addition to discussing how to export tokens, the focus of this article is to provide more reverse engineering ideas, thereby creating more convenient tools (such as third-party QR code login platforms). This work itself is not very difficult, but it is quite tedious. If this article can save you some preliminary work time, that would be wonderful.

{/* AI */}

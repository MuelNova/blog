---
title: 小米手环 8 Pro 自动上传数据到 Obsidian 的思路
description: 博客作者nova讲述了如何将小米手环8 Pro的数据自动上传到Obsidian的过程。起初，基于自己生活管理系统的需求，nova尝试通过逆向工程和抓包分析小米手环数据，最终发现利用API接口获取数据不可行，因为数据传输高度加密。
pubDate: 2024-02-01
tags:
- Reverse
- Investigate
authors:
- nova

---
Recently, I set up a life management system with the help of [DIYGOD](https://diygod.cc). With various plugins, I achieved semi-automation. However, manually recording sleep time, steps, and other data like heart rate and blood pressure is not very geeky. After some research, I found out that Zepp (formerly Huami) has a reverse-engineered API interface that stores step count and other information in plaintext. This led me to impulsively purchase the **_Xiaomi Mi Band 8 Pro Genshin Impact Limited Edition_**. To my surprise, I discovered that the Xiaomi Mi Band 8 no longer supports Zepp. Although the Xiaomi Mi Band 7 does not officially support Zepp, it can still be used by modifying the QR code and using the Zepp installation package. However, the Xiaomi Mi Band 8 has completely deprecated Zepp.

## Initial Exploration — Packet Capture

Firstly, I attempted to capture packets to see if there was any useful information available. I used to use Proxifier for packet capture, but it was not very effective due to some software having SSLPinning. This time, I utilized mitmproxy along with a system-level certificate.

### Tools Used

- [mitmproxy - an interactive HTTPS proxy](https://mitmproxy.org/)
- [nccgroup/ConscryptTrustUserCerts](https://github.com/nccgroup/ConscryptTrustUserCerts)
- [shockeyzhang/magisk-delta](https://github.com/shockeyzhang/magisk-delta)

### Testing Method

In a nutshell, I installed mitmproxy on my PC, obtained the `mitmproxy-ca-cert.cer` file in the `$HOME/.mitmproxy` directory, and installed it on the Android device as per the normal workflow.

I then installed `ConscryptTrustUserCerts` in Magisk, restarted the device, which mounted the user-level certificate to the system-level certificate directory during boot. This completed the preparation.

After opening mitmweb on the PC, setting the Wi-Fi proxy on the phone to `<my-pc-ip>:8080`, I successfully captured HTTPS requests.

### Conclusion

It was not very useful. All requests were encrypted, and there were signatures, hashes, nonces, etc., to ensure security. I did not want to reverse engineer the apk, so I abandoned this approach.

## Glimpse of Hope — BLE Connection

Since packet capturing was not feasible, I decided to create a BLE client to connect to the smart band and retrieve data, which seemed like a very reasonable approach. Moreover, this method did not require any actions on my phone; a script running on Obsidian, with one connection and data retrieval, seemed to be very automated.

### Implementation

The code mainly referenced [wuhan005/mebeats: 💓 Real-time heart rate data collection for Xiaomi Mi Bands](https://github.com/wuhan005/mebeats). However, as his tools were for MacOS, I made some modifications with the help of GPT.

```java
// Java code block translated to English
public final void bindDeviceToServer(lg1 lg1Var) {

        Logger.i(getTAG(), "bindDeviceToServer start");

        HuaMiInternalApiCaller huaMiDevice = HuaMiDeviceTool.Companion.getInstance().getHuaMiDevice(this.mac);

        if (huaMiDevice == null) {

            String tag = getTAG();

            Logger.i(tag + "bindDeviceToServer huaMiDevice == null", new Object[0]);

            if (lg1Var != null) {

                lg1Var.onConnectFailure(4);

            }

        } else if (needCheckLockRegion() && isParallel(huaMiDevice)) {

            unbindHuaMiDevice(huaMiDevice, lg1Var);

        } else {

            DeviceInfoExt deviceInfo = huaMiDevice.getDeviceInfo();

            if (deviceInfo == null) {

                String tag2 = getTAG();

                Logger.i(tag2 + "bindDeviceToServer deviceInfo == null", new Object[0]);

                return;

            }

            String sn = deviceInfo.getSn();

            setMDid("huami." + sn);

            setSn(deviceInfo.getSn());

            BindRequestData create = BindRequestData.Companion.create(deviceInfo.getSn(), this.mac, deviceInfo.getDeviceId(), deviceInfo.getDeviceType(), deviceInfo.getDeviceSource(), deviceInfo.getAuthKey(), deviceInfo.getFirmwareVersion(), deviceInfo.getSoftwareVersion(), deviceInfo.getSystemVersion(), deviceInfo.getSystemModel(), deviceInfo.getHardwareVersion());

            String tag3 = getTAG();

            Logger.d(tag3 + create, new Object[0]);

            getMHuaMiRequest().bindDevice(create, new HuaMiDeviceBinder$bindDeviceToServer$1(this, lg1Var), new HuaMiDeviceBinder$bindDeviceToServer$2(lg1Var, this));

        }

    }
```

By examining this function, we can see that the data is retrieved from `deviceInfo`, which is obtained from `huaMiDevice`. For those interested, the details of how this is derived can be explored in the package `com.xiaomi.wearable.wear.connection`.

## The Ultimate Solution — Frida Hook

At this point, I had already decided on the final approach - reverse engineering. Since the data sent out is encrypted, there must be a process where unencrypted data handling occurs. By reverse engineering it, hooking into it, and writing an Xposed module to monitor it, the task could be accomplished.

Due to time constraints, I will not delve into how to install [Frida](https://frida.rs).

Initially, I used `jadx-gui` with the feature `copy as frida snippets`, which saved a lot of effort. However, due to various peculiarities of Kotlin data classes, many times the necessary information cannot be obtained. As I did not document my journey while troubleshooting, here is a brief overview:

1. Initially, I observed the `fitness_summary` database in the `/data/data/com.mi.health/databases` folder, which contains the desired data. Cross-referencing led me to the `com.xiaomi.fit.fitness.persist.db.internal` class.
2. Exploring methods such as `update` and `insert`, I found `com.xiaomi.fit.fitness.persist.db.internal.h.getDailyRecord` method which had output every time a refresh occurred, but only contained values such as `sid`, `time`, and did not include the `value`.
3. Continuing the trail, I used the given code snippet to inspect overloads and parameter types.

```javascript
var insertMethodOverloads = hClass.updateAll.overloads;

for (var i = 0; i < insertMethodOverloads.length; i++) {
  var overload = insertMethodOverloads[i];
  console.log(
    "Overload #" + i + " has " + overload.argumentTypes.length + " arguments."
  );
  for (var j = 0; j < overload.argumentTypes.length; j++) {
    console.log(
      " - Argument " + j + ": " + overload.argumentTypes[j].className
    );
  }
}
```

4. It struck me that exceptions could be utilized to examine the function call stack - a breakthrough moment.

```javascript
var callerMethodName = Java.use("android.util.Log").getStackTraceString(
  Java.use("java.lang.Exception").$new()
);
console.log("getTheOneDailyRecord called by: " + callerMethodName);
```

5. Proceeding layer by layer, I discovered the class `com.xiaomi.fit.fitness.export.data.aggregation.DailyBasicReport`, which perfectly met my needs.

```javascript
dbutilsClass.getAllDailyRecord.overload(
  "com.xiaomi.fit.fitness.export.data.annotation.HomeDataType",
  "java.lang.String",
  "long",
  "long",
  "int"
).implementation = function (homeDataType, str, j, j2, i) {
  console.log(
    "getAllDailyRecord called with args: " +
      homeDataType +
      ", " +
      str +
      ", " +
      j +
      ", " +
      j2 +
      ", " +
      i
  );
  var result = this.getAllDailyRecord(homeDataType, str, j, j2, i);
  var entrySet = result.entrySet();
  var iterator = entrySet.iterator();
  while (iterator.hasNext()) {
    var entry = iterator.next();
    console.log("entry: " + entry);
  }
  var callerMethodName = Java.use("android.util.Log").getStackTraceString(
    Java.use("java.lang.Exception").$new()
  );
  console.log("getTheOneDailyRecord called by: " + callerMethodName);
  return result;
};

// Output: DailyStepReport(time=1706745600, time = 2024-02-01 08:00:00, tag='days', steps=110, distance=66, calories=3, minStartTime=1706809500, maxEndTime=1706809560, avgStep=110, avgDis=66, active=[], stepRecords=[StepRecord{time = 2024-02-02 01:30:00, steps = 110, distance = 66, calories = 3}])
```

6. Faced a challenge as `steps` is a `private` attribute, and none of the interfaces like `getSteps()`, `getSourceData()` worked, all displaying `not a function`. Likely a difference in Kotlin and Java handling. Resorted to using reflection for resolution.

The final `frida` script was formulated to fetch the daily `steps` data. Altering `HomeDataType` would yield other data.

```javascript
var CommonSummaryUpdaterCompanion = Java.use(
  "com.xiaomi.fitness.aggregation.health.updater.CommonSummaryUpdater$Companion"
);
var HomeDataType = Java.use(
  "com.xiaomi.fit.fitness.export.data.annotation.HomeDataType"
);
var instance = CommonSummaryUpdaterCompanion.$new().getInstance();
console.log("instance: " + instance);

var step = HomeDataType.STEP;
var DailyStepReport = Java.use(
  "com.xiaomi.fit.fitness.export.data.aggregation.DailyStepReport"
);

var result = instance.getReportList(step.value, 1706745600, 1706832000);
var report = result.get(0);
console.log("report: " + report + report.getClass());

var stepsField = DailyStepReport.class.getDeclaredField("steps");
stepsField.setAccessible(true);
var steps = stepsField.get(report);
console.log("Steps: " + steps);
// Output: Steps: 110
```

## Final – Xposed Module

The approach now is to listen to a specific address using XPosed, and then to slightly ~~protect against plaintext transmission~~ pigeonholed here. Since the app is always active, I believe this method is feasible. The current challenge is my lack of knowledge in writing Kotlin, let alone Xposed.

Fortunately, the Kotlin compiler's suggestions are powerful enough, and besides configuring Xposed, no additional knowledge is required. Coupled with the powerful GPT, I spent an hour or two figuring out the initial environment setup (hard to assess gradle, it's slow without a proxy, and with a proxy, it becomes unresponsive).```kotlin
if (record != null) {
SerializableStepRecord(
time = XposedHelpers.getLongField(record, "time"),
steps = XposedHelpers.getIntField(record, "steps"),
distance = XposedHelpers.getIntField(record, "distance"),
calories = XposedHelpers.getIntField(record, "calories")
)
} else null
}

        val activeStageList = activeStageListObject.mapNotNull { activeStageItem ->
            if (activeStageItem != null) {
                SerializableActiveStageItem(
                    calories = XposedHelpers.getIntField(activeStageItem, "calories"),
                    distance = XposedHelpers.getIntField(activeStageItem, "distance"),
                    endTime = XposedHelpers.getLongField(activeStageItem, "endTime"),
                    riseHeight = XposedHelpers.getObjectField(activeStageItem, "riseHeight") as? Float,
                    startTime = XposedHelpers.getLongField(activeStageItem, "startTime"),
                    steps = XposedHelpers.getObjectField(activeStageItem, "steps") as? Int,
                    type = XposedHelpers.getIntField(activeStageItem, "type")
                )
            } else null
        }

        return SerializableDailyStepReport(
            time = XposedHelpers.getLongField(xposedReport, "time"),
            tag = XposedHelpers.getObjectField(xposedReport, "tag") as String,
            steps = XposedHelpers.getIntField(xposedReport, "steps"),
            distance = XposedHelpers.getIntField(xposedReport, "distance"),
            calories = XposedHelpers.getIntField(xposedReport, "calories"),
            minStartTime = XposedHelpers.getObjectField(xposedReport, "minStartTime") as Long?,
            maxEndTime = XposedHelpers.getObjectField(xposedReport, "maxEndTime") as Long?,
            avgStep = XposedHelpers.callMethod(xposedReport, "getAvgStepsPerDay") as Int,
            avgDis = XposedHelpers.callMethod(xposedReport, "getAvgDistancePerDay") as Int,
            stepRecords = stepRecords,
            activeStageList = activeStageList
        )
    }

}

````

The code above shows a function that processes data retrieved from some records and returns a `SerializableDailyStepReport` object. It extracts and maps various attributes from the records, such as time, steps, distance, and calories, into corresponding fields of the `SerializableStepRecord` and `SerializableActiveStageItem` objects. Finally, it constructs a `SerializableDailyStepReport` object with the processed data.

```kotlin
// build.gradle.kts [Module]
plugins {
    ...
    kotlin("plugin.serialization") version "1.9.21"
}

dependencies {
    ...
    implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.6.2")
}
````

The first code snippet contains the configuration in the build.gradle.kts file for enabling the Kotlin serialization plugin. It also includes the dependency for `kotlinx-serialization-json` library for JSON serialization.

```kotlin
return Json.encodeToJsonElement(SerializableDailyStepReport.serializer(), convertToSerializableReport(today))
```

In the above statement, it uses `Json.encodeToJsonElement` to convert a `SerializableDailyStepReport` object to a JSON element using its serializer.

#### Broadcasting

The discussion in this section delves into the challenges faced while considering broadcasting data for an Android application. The initial idea was to use a `BroadcastReceiver` but was dropped due to complexities related to sending messages between the Android device and a computer.

This led to exploring alternatives like HTTP RESTful APIs, which were implemented using Ktor. However, the fluctuating data retrieval schedule and the need for continuous server upkeep introduced concerns regarding power consumption.

Subsequently, the notion of using sockets was explored to establish communication. A `ServerSocket` is created to listen for incoming connections, and a `ClientHandler` is spawned to handle each client's requests. This approach provides a more direct and energy-efficient means of communication compared to HTTP servers.

```kotlin
class MySocketServer(
    private val port: Int,
    private val lpparam: LoadPackageParam,
    private val instance: Any
    ) {
    fun startServerInBackground() {
        Thread {
            try {
                val serverSocket = ServerSocket(port)
                Log.d("MiBand", "Server started on port: ${serverSocket.localPort}")
                while (!Thread.currentThread().isInterrupted) {
                    val clientSocket = serverSocket.accept()
                    val clientHandler = ClientHandler(clientSocket)
                    Thread(clientHandler).start()
                }
            } catch (e: Exception) {
                Log.e("MiBand", "Server Error: ${e.message}")
            }
        }.start()
    }
```

Above is a snippet depicting the creation of a socket server that listens on a specified port, handles incoming client connections, and delegates processing to separate threads for improved concurrency.

The subsequent realization of the limitation concerning running external scripts in the Obsidian environment using Templater led to the manual implementation of HTTP protocol communication to cater to data retrieval requirements within that context.

```kotlin
override fun run() {
    try {
        // Code for handling HTTP requests and responses
    } catch (e: IOException) {
        e.printStackTrace()
    }
}

private fun parseQueryString(query: String?): Map<String, String> {
    // Parsing the query string from the HTTP request
}

private fun sendSuccessResponse(outputStream: PrintWriter, result: SerializableResponse) {
    // Sending a successful HTTP response with serialized data
}
```

The code snippet above demonstrates the processing of incoming HTTP requests by parsing the request, handling different paths, and sending appropriate responses back to the clients.

Overall, the combined use of socket communication and manual HTTP handling provides the necessary infrastructure to facilitate data exchange between the Android application and external systems while maintaining a balance between efficiency and functionality.

:::info
This Content is generated by LLM and might be wrong / incomplete, refer to Chinese version if you find something wrong.
:::

{/* AI */}

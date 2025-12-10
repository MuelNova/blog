---
title: MacOS 添加多个相同 Organization OneDrive 账户
description: 好久没水博客了，最近买了 Mac，遇到了这个问题，解决一下。
pubDate: 2025-03-24
authors:
- nova
---

好久没水博客了，最近买了 Mac，遇到了这个问题，解决一下。

简而言之，就是 Mac CloudStorage 在添加 Onedrive 的时候，是用的 "Onedrive - %ORG_NAME%" 作为唯一标识符，因此会导致无法添加多个相同账户，对我这种 E5 云存储小偷非常不利。

<!--truncate-->

首先正常添加用户 A，完成后，你应该能在 `~/Library/CloudStorage` 下看到对应的 OneDrive 文件

![image-20250324131551356](https://cdn.nova.gal/img/image-20250324131551356.png)



此时 **退出所有的 OneDrive 程序**，跳转到 `~/Library/Containers/com.microsoft.OneDrive-mac/Data/Library/Application Support/OneDrive/settings/Business1`，此时你能看到一个 `「GUID」.ini` 文件

:::warning

如果你不是从 AppStore 下载的，那它应该直接位于 `~/Library/Application Support/OneDrive/settings/Business1`

:::

![image-20250324132225033](https://cdn.nova.gal/img/image-20250324132225033.png)

打开这个文件，你应该能看到这里有一个写了你组织名的地方，把它修改成你想的东西（例如说 OneDrive - Photos），不要和组织名重合。

![image-20250324132909430](/Users/muelnova/Library/Application Support/typora-user-images/image-20250324132909430.png)

保存，然后打开 OneDrive，此时它应该会报错找不到这个文件了，点击重试，等一会之后再重启 OneDrive。

![image-20250324133325460](https://cdn.nova.gal/img/image-20250324133325460.png)

此时 OneDrive 应该已经正常工作了，并且你可以看到新的 OneDrive 文件夹

![image-20250324133536785](https://cdn.nova.gal/img/image-20250324133536785.png)

现在可以加新号了，它会保存在 `~/Library/Containers/com.microsoft.OneDrive-mac/Data/Library/Application Support/OneDrive/settings/Business2`，之后就以此类推。

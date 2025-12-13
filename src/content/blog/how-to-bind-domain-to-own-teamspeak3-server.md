---
title: 如何使用自己的域名替换TS自建服务器的IP
description: 博客文章详细介绍了如何使用自己的域名来替换 TeamSpeak3 自建服务器的 IP 地址。文章的关键内容包括：
pubDate: 2021-11-30
tags:
- teamspeak
- Investigate

---

# TeamSpeak3 自建服务器使用域名替换 IP

## 准备工作

- 一个已经安装过[Teamspeak3 Server](https://www.teamspeak.com/en/downloads/#server)的服务器
- 一个域名

<!--truncate-->

## 操作步骤(以[GoDaddy](https://www.godaddy.com/)的 DNS 控制为例)

### 1.添加 A 记录

- 在`名称`处填写主机头(例如，对于我的域名[n.ova.moe](https://nova.gal)我想使用`ts.n.ova.moe`登录 Teamspeak，则填写`ts`)
- 在`值`处填写对应服务器 IP(即原来登录 Teamspeak 所使用的 IP)

### 2.添加 SRV 记录

- 以`_ts3`作为服务
- 以`_udp`作为协议
- 以`1`处填写的`主机头`为名称
- 以**完整的域名**为目标
- 以`Teamspeak端口`为端口(默认为`9987`)
- 设置`权重`为 5, `优先级`为 0（或 1）
- 你可以设置 TTL 为 1800 秒，因为这是 ts3 服务器刷新的时长

保存设置后，你的两个记录应该是这个样子的：（请自行替换其中的内容）

| 类型 | 名称           | 值                    | TTL     |
| ---- | -------------- | --------------------- | ------- |
| A    | ts             | 127.0.0.1             | 3600 秒 |
| SRV  | \_ts3.\_udp.ts | 0 5 9987 ts.n.ova.moe | 1800 秒 |

## 大功告成

现在，你可以尝试使用所设置的域名连接至 Teamspeak 了！
如果失败的话，你可以等待半个小时左右再次连接尝试。

## 一些注意事项

我也不知道，嘿嘿

---
title: 搭建一个全自动STEAM挂刀前后端
description: 博客作者 nova 详细描述了如何搭建一个全自动的 STEAM 挂刀系统，包括前端和后端部分。项目的目标是能够实时监控饰品售出比例、自动更改价格、爬取低比例饰品、实现饰品可视化管理、对不同账户进行管理，并安全地保存和处理信息。
pubDate: 2022-12-30
tags:
- steam
- Investigate
authors:
- nova

math: true
---
# Setting up a fully automatic STEAM trading bot front and back end

# Aims

- [ ] Real-time monitoring of the sales proportion and demand proportion of items
- [ ] Automatic price adjustments (involving STEAM token generation, trade confirmation, etc.)
- [ ] Crawling for low percentage items
- [ ] Visual management of items
- [ ] Managing different accounts
- [ ] Relatively safe information storage/handling methods
- [ ] ...

# Backend

## Environment

Planning to use `FASTAPI` as the backend. Create an environment using `Conda`, and install `FASTAPI`

```sh
pip install fastapi[all]
```

Use `uvicorn` as the server for running the program

Start by setting up the basic framework

```python
import uvicorn
from fastapi import FastAPI

app = FastAPI()

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=4345)
```

## STEAM Related

### Login

~~As a first version, I plan to use cookies directly for login operations, and may consider switching to username and password in future versions~~

To implement STEAM login, the relevant requests need to be captured.

#### Principle

![Capture](https://oss.nova.gal/img/image-20220307220607534.png)

1. Received the account's `public_key` through `getrsakey/`, with `donotcache` and `username` fields in the `payload`

Here, `donotcache` is the timestamp multiplied by 1000 and rounded, and `username` is the plaintext Steam account name

The returned JSON looks like

```json
{
  "success": true,
  "publickey_mod": "deadbeef0deadbeef0deadbeef",
  "publickey_exp": "010001",
  "timestamp": "216071450000",
  "token_gid": "deadbeef0deadbee"
}
```

Provided `modulus` and `exponent`, we need to generate our public key and encrypt the password

i.e.

$$
c = m^e \pmod m
$$

2. Use `dologin/` to login with different payloads and validate `2fa`

The typical payload looks like

```json
{
  "donotcache": 1646663656289, // Same timestamp as above
  "password": "base64_encoded_encrypted_password", // RSA public key encrypted binary data encoded in base64
  "username": "username", // Username
  "twofactorcode": "Guard_Code", // Mobile authenticator code
  "emailauth": "", // Email verification code
  "captchagid": 4210307962151791925, // CaptchaGID, retrieved from the value returned by `do_login/`, and fetch the Captcha image at `https://steamcommunity.com/login/rendercaptcha/?gid=%captchagid%`
  "captcha_text": "th37yr", // Captcha text, if needed, must exist simultaneously with the item above
  "rsatimestamp": 216071450000, // RSA expiration time, obtainable in `getrsakey/`
  "remember_login": true // Save login information (although we don't need it)
}
```

The results are conveyed through different return values, for example:

```json
{
  "success": false,
  "requires_twofactor": true,
  "message": ""
}
```

```json
{
  "success": false,
  "message": "Please enter the characters below to verify this is a human operation.",
  "requires_twofactor": false,
  "captcha_needed": true,
  "captcha_gid": "4209182061243079173"
}
```

#### Implementation

Using `aiohttp` for interaction

```python
import base64
import rsa
import time

from aiohttp import ClientSession
from typing import Dict

BASE_STEAM_URL = "https://steamcommunity.com"
GET_RSA_KEY_API_URL = "/login/getrsakey/"
DO_LOGIN_API_URL = "/login/dologin/"
LOGIN_URL = "/login?oauth_client_id=DEADBEEF&oauth_scope=read_profile%20write_profile%20read_client%20write_client"


class Response(Dict):

    def __getattr__(self, item):
        return self.get(item)

    def __setattr__(self, key, value):
        self.__setitem__(key, value)


async def do_login(username: str,
                   password: str,
                   twofactorcode: str = '',
                   emailauth: str = '',
                   captchagid: int = 0,
                   captcha_text: str = '',
                   headers: Dict = None,
                   cookies: Dict = None,
                   **kwargs) -> Response:
    """
    login steam and return the Response
    :param username: steam username
    :param password: steam password, should be plaintext
    :param twofactorcode: optional, steam guard code
    :param emailauth: optional, steam email guard code
    :param captchagid: optional, steam will tell it if needed
    :param captcha_text: optional, captcha text, should be set together with captchagid
    :param headers: optional, custom headers
    :param cookies: optional, custom cookies
    :param kwargs: optional, args for ClientSession
    :return:
    """
    if headers is None:
        headers = {"X-Requested-With": "com.valvesoftware.android.steam.community",
                   "Referer": "https://steamcommunity.com/mobilelogin?oauth_client_id=DEADBEEF&oauth_scope=read_profile%20write_profile%20read_client%20write_client"}
    if cookies is None:
        cookies = {"mobileClientVersion": "0 (2.3.13)",
                   "mobileClient": "android",
                   "Steam_Language": "schinese"}

    async with ClientSession(headers=headers, cookies=cookies, **kwargs) as session:
        data = {
            "donotcache": int(time.time()*1000),
            "username": username
        }
        async with session.post(BASE_STEAM_URL + GET_RSA_KEY_API_URL, data=data) as resp:
            if resp.status == 200 and (response := await resp.json()).get("success"):
                response = Response(response)
                modulus = int(response.publickey_mod, 16)
                exponent = int(response.publickey_exp, 16)
                rsa_timestamp = response.timestamp
            else:
                if resp.status == 200:
                    raise ConnectionError(f"Get RSA Key Error! [{resp.status}]: {response}")
                else:
                    raise ConnectionError(f"Get RSA Key Error! Error Code: {resp.status}")

        public_key = rsa.PublicKey(modulus, exponent)
        en_password = password.encode(encoding='UTF-8')
        en_password = rsa.encrypt(en_password, public_key)
        en_password = base64.b64encode(en_password)

        data = {
            "donotcache": int(time.time() * 1000),
            "username": username,
            "password": en_password.decode('UTF-8'),
            "twofactorcode": twofactorcode,
            "emailauth": emailauth,
            "rsatimestamp": rsa_timestamp,
            "remember_login": True
        }
        if captchagid and captcha_text:
            data["captchagid"] = captchagid
            data["captcha_text"] = captcha_text
        async with session.post(BASE_STEAM_URL + DO_LOGIN_API_URL, data=data) as resp:

            if resp.status == 200:
                response = Response(await resp.json())
                if response.success:
                    response.cookie = resp.cookies.output()
                    response.cookie_object = resp.cookies
                return response
            else:
                raise ConnectionError(f"Login Error! Error Code: {resp.status}")

```

Not much to elaborate, just created a `Response` class to save some time.

It's worth noting that when logging in successfully, I pass in a `cookie` and a `cookie_object` (`Simplecookie object`) as it will be useful for subsequent uses.

> TODO: raising a `ConnectionError`, may create custom exceptions later on.

### Token

Before implementing token generation, let's first understand the principle behind it

#### Principle

Firstly, it's important to recognize that STEAM token generation algorithm is a form of [Time-based One-time Password (TOTP)](https://en.wikipedia.org/wiki/Time-based_one-time_password) algorithm

Based on the `RFC-6238` standard STEAM utilizes, in the implementation process of this algorithm, `Client` and `Server` need to negotiate a common `Secret` as a key—referred to as `shared_secret` in the token detailed data

At this point, according to the standard STEAM token generation technique utilized, the `T0` (Unix Time) and `T1` (30s) along with the current timestamp are used to calculate the message `C` (counter, i.e., how many `T1`s have passed since `T0`), and the key `Secret` is used as the key to calculate the `HMAC` value using the standard encryption algorithm `SHA-1`

Taking the lowest 4 significant bits of the `HMAC` as the `byte offset` and discarding them

After discarding these 4 bits, from the `MSB` of the `byte offset`, discard the most significant bit (to avoid it becoming a sign bit), and take 31 bits, the password is these as decimal numbers based on 10.

STEAM further adapts this by assigning CODE_CHARSET to the digits. The specific method is to divide the decimal number corresponding to the password by the length of `CODE_CHARSET`, where the remainder is the index to `CODE_CHARSET`, and the quotient continues the operation with the new decimal number until 5 numbers are obtained.

> The `CODE_CHARSET` and the algorithm mapping it are not found from reliable sources. It is speculated that it was obtained by decompiling the STEAM client or knowledgeable attempts.

#### Implementation

~~It is a sin to reinvent the wheel. In the spirit of using more libraries since it is for personal use, I chose the `pyotp` library as a one-click `TOTP` generation tool.~~

~~However, it failed. For unknown reasons, the base32 secret generated incorrectly.~~

Having gained a thorough understanding of the implementation principle, I decided to implement this algorithm manually once, abstaining from using ready-made libraries to simplify the project.

```python
import hmac
import hashlib
import time
import base64


def gen_guard_code(shared_secret: str) -> str:
    """
    Generate the Guard Code using `shared_secret`
    :param shared_secret: shared_secret, should be a base64-encoded string
    :return: the guard code
    """
    shared_secret = shared_secret.encode('UTF-8')
    b64_decoded_shared_secret = base64.b64decode(shared_secret)
    time_bytes = (int(time.time()) // 30).to_bytes(8, byteorder='big')  # Turn time_stamp into a 64 bit unsigned int
    hmac_code = hmac.new(b64_decoded_shared_secret, time_bytes, hashlib.sha1).digest()  # Generate HMAC code
    byte_offset = hmac_code[-1] & 0xf  # Get last 4 bits as bytes offset
    code_int = (
        (hmac_code[byte_offset] & 0x7f) << 24 |  # Drop off the first bit (MSB)
        (hmac_code[byte_offset+1] & 0xff) << 16 |
        (hmac_code[byte_offset+2] & 0xff) << 8 |
        (hmac_code[byte_offset+3] & 0xff)
    )
    CODE_CHARSET = [50, 51, 52, 53, 54, 55, 56, 57, 66, 67, 68, 70, 71,
                    72, 74, 75, 77, 78, 80, 81, 82, 84, 86, 87, 88, 89]
    codes = ''
    for _ in range(5):
        code_int, i = divmod(code_int, len(CODE_CHARSET))
        codes += chr(CODE_CHARSET[i])
    return codes

```

![Token successfully generated](https://oss.nova.gal/img/image-20220306231115470.png)

### Trade Confirmation

Trading is perhaps one of the most complicated aspects related to STEAM. It requires `identity_secret` and `device_id` as parameters.

#### Confirmation List

Through packet sniffing on the mobile end, the confirmation page's `API_URL` is `https://steamcommunity.com/mobileconf/conf?%payload%`

First, let's implement `fetch_confirmation_query_params`, i.e., to fetch the confirmation list

Required parameters are

| Param | Description                                                                                                                |
| ----- | -------------------------------------------------------------------------------------------------------------------------- |
| p     | `device_id`                                                                                                                |
| a     | `steam_id`                                                                                                                 |
| t     | Timestamp                                                                                                                  |
| m     | Device (`Android`/`IOS`)                                                                                                   |
| tag   | Tag, unique value `conf` (to be confirmed)                                                                                 |
| k     | `timehash`, generated by `time_stamp` and `tag` as parameters, encoded in base64 `HMAC` using `identity_secret` as the key |

Initially, generate `timehash`

```python
import base64
import hashlib
import hmac
import time


def gen_confirmation_key(times: int, identity_secret: str, tag: str = 'conf') -> str:
    """
    Generate the secret for confirmation to check.
    :param times: time_stamp, should be int instead of float
    :param identity_secret:
    :param tag: 'conf', 'allow', 'cancel', 'details%id%'
    :return: base64-encoded secret, which is not urlencoded.
    """
    msg = times.to_bytes(8, byteorder='big') + tag.encode('UTF-8')
    key = base64.b64decode(identity_secret.encode('UTF-8'))
    secret = hmac.new(key, msg, hashlib.sha1).digest()
    return base64.b64encode(secret).decode('UTF-8')

```

Next, write the request call, as the confirmation page seemingly doesn't have a front and back end separation; hence, crawling for the confirmation list is the only approach.

```python
from aiohttp import ClientSession
from urllib.parse import urlencode, quote_plus

from typing import Union, Dict, List
from http.cookies import SimpleCookie


BASE_STEAM_URL = "https://steamcommunity.com"
MOBILECONF_URL = "/mobileconf/conf"


async def fetch_confirmation_query(cookies: Union[Dict, SimpleCookie],
                                   steam_id: str,
                                   identity_secret: str,
                                   device_id: str,
                                   tag: str = "conf",
                                   m: str = "android",
                                   headers: Dict = None) -> Dict[str, Union[str, List[Dict]]]:
    """
    fetch confirmation query as a list of json dict.
    :param cookies: Cookies contains login information
    :param steam_id: 64bit steamid
    :param identity_secret:
    :param device_id:
    :param tag: 'conf'
    :param m: 'android', 'ios'
    :param headers:
    :return: Response of confirmation query.
    """
    if headers is None:
        headers = {
            "X-Requested-With": "com.valvesoftware.android.steam.community",
            "Accept-Language": "zh-CN,zh;q=0.9"
        }
    times = int(time.time())
    query = {
        "p": device_id,
        "a": steam_id,
        "k": gen_confirmation_key(times, identity_secret, tag),
        "t": times,
        "m": m,
        "tag": tag
    }

    async with ClientSession(headers=headers, cookies=cookies) as session:
        print(BASE_STEAM_URL + MOBILECONF_URL + '?' + urlencode(query))
        print(urlencode(query, safe=":"), type(urlencode(query)))
        async with session.get(BASE_STEAM_URL + MOBILECONF_URL + '?' + urlencode(query)) as resp:
            if resp.status == 200:
                # do something
                pass
            else:
                raise ConnectionError(f"Fetch Confirmation Error! Error Code: {resp.status}")

```

Based on my usual practices, I opted for `beautifulsoup4` as the extractor and `lxml` as the parser

```python
from bs4 import BeautifulSoup


def steam_confirmation_parser(html: str):
    soup = BeautifulSoup(html, 'lxml')
    confirmations = soup.find_all("div", class_="mobileconf_list_entry")
    if len(confirmations):
        data_list = []
        for confirmation in confirmations:
            data = {
                "type": confirmation.get('data-type'),
                "confid": confirmation.get('data-confid'),
                "key": confirmation.get('data-key'),
                "creator": confirmation.get('data-creator'),
                "accept_text": confirmation.get('data-accept'),
                "cancel_text": confirmation.get('data-cancel'),
                "img": confirmation.find('img')['src'],
                "desc": "\n".join(confirmation.stripped_strings)
            }
            data_list.append(data)
        return {
            "success": True,
            "data": data_list
        }
    return {
        "success": soup.find('div', id="mobileconf_empty"),
        "data": ["\n".join(soup.find('div', id="mobileconf_empty").stripped_strings)]
        if soup.find('div', id="mobileconf_empty") else ["Invalid Html\nIt is not a parsable html."]
    }
```

#### Sending Requests

Having established the above foundation, sending requests becomes straightforward.

The `url` is `https://steamcommunity.com/mobileconf/ajaxop?%payload%`

The `payload` parameters are as follows

| Param | Description                                                                                                                 |
| ----- | --------------------------------------------------------------------------------------------------------------------------- |
| p     | `device_id`                                                                                                                 |
| a     | `steam_id`                                                                                                                  |
| t     | Timestamp                                                                                                                   |
| m     | Device (`Android`/`IOS`)                                                                                                    |
| op    | Action, either `cancel` or `allow`                                                                                          |
| k     | `timehash`, generated from `time_stamp` and `op` as parameters, encoded in base64 `HMAC` using `identity_secret` as the key |
| cid   | `data-confid`, provided in `<div>` tag with class `mobileconf_list_entry`                                                   |
| ck    | `data-key`, provided in `<div>` tag with class `mobileconf_list_entry`                                                      |

````python
AJAX_POST_URL = "/mobileconf/ajaxop"

async def send_confirmation_ajax(cookies: Union[Dict, SimpleCookie],
                                 steam_id: str,
                                 identity_secret: str,
                                 device_id: str,
                                 cid: str,
                                 ck: str,
                                 op: str = "allow",
                                 m: str = "android",
                                 headers: Dict = None) -> bool:
    """
    Send AJax post to allow/cancel a confirmation
    :param cookies: Cookies contains login information
    :param steam_id: 64```python
def fetch_confirmation_details(cookies: Dict, steam_id: str, identity_secret: str, device_id: str, cid: str, m: str = "android", headers: Dict = None) -> Dict[str, str]:
    """
    Fetch a confirmation's details
    :param cookies: Cookies contains login information
    :param steam_id: 64bit steamid
    :param identity_secret:
    :param device_id:
    :param cid: data-confid
    :param m: 'android', 'ios'
    :param headers:
    :return: The Response
    """
    if headers is None:
        headers = {
            "X-Requested-With": "com.valvesoftware.android.steam.community",
            "Accept-Language": "zh-CN,zh;q=0.9"
        }
    times = int(time.time())
    tag = "details" + cid
    query = {
        "tag": tag,
        "p": device_id,
        "a": steam_id,
        "k": gen_confirmation_key(times, identity_secret, tag),
        "t": times,
        "m": m,
    }
    async with ClientSession(headers=headers, cookies=cookies) as session:
        async with session.get(BASE_STEAM_URL + DETAIL_URL + cid + '?' + urlencode(query)) as resp:
            if resp.status == 200:
                return await resp.json()
            else:
                raise ConnectionError(f"Fetch Confirmation Details Error! Error Code: {resp.status}")
````

:::info
This Content is generated by LLM and might be wrong / incomplete, refer to Chinese version if you find something wrong.
:::

{/* AI */}

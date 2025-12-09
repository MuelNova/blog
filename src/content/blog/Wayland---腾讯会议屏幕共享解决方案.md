---
title: Wayland - 腾讯会议屏幕共享解决方案
description: Nova在这篇文章中分享了一种解决使用Wayland系统在腾讯会议中进行屏幕共享的问题的方案。他遇到的主要问题是，在使用Wayland时，只能看到鼠标指针，而不能正确地共享屏幕内容。通过一番搜索，他找到了一种比较优雅但稍有些复杂的解决方法，并决定在文中做简要记录。
pubDate: 2024-04-08
authors:
- nova
category: '[''arch'']'
---

组会的时候尝试投屏却只能看到我的鼠标指针，最后演变为使用健硕手机拍屏方案，好不雅观。经过一翻搜索找到一个比较优雅（Yet 扭曲）的解决方案，因此简单记录一下。

<!--truncate-->

## 安装

安装 [Xwayland-standalone](https://aur.archlinux.org/packages/xwayland-standalone-with-libdecor) (基本上就是配置了 libdecor 支持的 xorg-xwayland) 和 [openbox](https://archlinux.org/packages/extra/x86_64/openbox/)

## 脚本

```python title=/usr/bin/xdp-screen-cast
#!/usr/bin/python3
# Original script: https://gitlab.gnome.org/-/snippets/19
# Sharing wayland screen/window with portal + pipewire to X programs
# Modifications:
# 1. Add --show-cursor option
# 2. Fix the bug that the script won't exit after the window is closed

# Known bugs:
# 1. Screencasting monitors without top bar may not work smoothly in GNOME
#    (Seems that this has been resolved in GNOME 43)
#    (Contents of xvimagesink window may not updated when not focused
#     and glitches may appear when sharing with cursor.
#     One workaround is to not maximize the xvimagesink window
#     and select "Always on top" in mutter window manager)
# 2. Sharing window in GNOME will bring a large black border around window
#    (And I don't know how to fix this: maybe gstreamer pipeline should know more about the window size?
#     and the sink should self-resize dynamically to fit the window size?)


import re
import dbus
from gi.repository import GLib
from dbus.mainloop.glib import DBusGMainLoop

import argparse

parser = argparse.ArgumentParser(description="Screencast with portal and gst")
parser.add_argument(
    "--show-cursor", help="Show cursor in the screencast", action="store_true"
)
parser.add_argument(
    "--remote-udp",
    help="Stream to remote UDP (receiver's UDP buffer size should be large enough)",
    action="store_true",
)
parser.add_argument(
    "--mjpeg",
    help="Use mjpeg instead of raw with remote-udp (lower bandwidth requirement)",
    action="store_true",
)
parser.add_argument(
    "--remote-receiver",
    help="Remote receiver address (default: 127.0.0.1)",
    default="127.0.0.1",
    type=str,
)
args = parser.parse_args()

# https://stackoverflow.com/a/30738533
if args.remote_udp:
    # fetch net.core.rmem_max
    with open("/proc/sys/net/core/rmem_max", "r") as f:
        net_core_rmem_max = int(f.read())
    if net_core_rmem_max < 1000000:
        print(
            "Warning: set net.core.rmem_max to 1000000 or larger on receiver to avoid horizontal line tearing (raw) or stuck (mjpeg)"
        )
        print("Command (1 MiB): sudo sysctl -w net.core.rmem_max=1048576")
        print("(16 MiB): sudo sysctl -w net.core.rmem_max=16777216")
    print("Your current UDP receive buffer size is %d" % net_core_rmem_max)

# cursor_mode 2: Embedded (The cursor is embedded as part of the stream buffers)
# showing cursor may cause some bugs in some environments
show_cursor = dbus.UInt32(2) if args.show_cursor else dbus.UInt32(1)

import gi

gi.require_version("Gst", "1.0")
from gi.repository import Gst

DBusGMainLoop(set_as_default=True)
Gst.init(None)

loop = GLib.MainLoop()

bus = dbus.SessionBus()
request_iface = "org.freedesktop.portal.Request"
screen_cast_iface = "org.freedesktop.portal.ScreenCast"

pipeline = None


def terminate():
    if pipeline is not None:
        pipeline.set_state(Gst.State.NULL)
    loop.quit()


request_token_counter = 0
session_token_counter = 0
sender_name = re.sub(r"\.", r"_", bus.get_unique_name()[1:])


def new_request_path():
    global request_token_counter
    request_token_counter = request_token_counter + 1
    token = "u%d" % request_token_counter
    path = "/org/freedesktop/portal/desktop/request/%s/%s" % (sender_name, token)
    return (path, token)


def new_session_path():
    global session_token_counter
    session_token_counter = session_token_counter + 1
    token = "u%d" % session_token_counter
    path = "/org/freedesktop/portal/desktop/session/%s/%s" % (sender_name, token)
    return (path, token)


def screen_cast_call(method, callback, *args, options={}):
    (request_path, request_token) = new_request_path()
    bus.add_signal_receiver(
        callback,
        "Response",
        request_iface,
        "org.freedesktop.portal.Desktop",
        request_path,
    )
    options["handle_token"] = request_token
    method(*(args + (options,)), dbus_interface=screen_cast_iface)


def on_gst_message(bus, message):
    type = message.type
    if type == Gst.MessageType.EOS or type == Gst.MessageType.ERROR:
        terminate()


def play_pipewire_stream(node_id):
    global pipeline
    empty_dict = dbus.Dictionary(signature="sv")
    fd_object = portal.OpenPipeWireRemote(
        session, empty_dict, dbus_interface=screen_cast_iface
    )
    fd = fd_object.take()
    if args.remote_udp:
        if not args.mjpeg:
            gst_command = f"pipewiresrc fd=%d path=%u ! videoconvert ! rtpvrawpay name=pay0 ! udpsink host={args.remote_receiver} port=5000"
        else:
            gst_command = f"pipewiresrc fd=%d path=%u ! videoconvert ! video/x-raw,format=I420 ! jpegenc ! rtpjpegpay name=pay0 ! udpsink host={args.remote_receiver} port=5000"
    else:
        gst_command = "pipewiresrc fd=%d path=%u ! videoconvert ! xvimagesink"
    # gst_command = "pipewiresrc fd=%d path=%u ! videoconvert ! xvimagesink" % (
    # gst_command = "pipewiresrc fd=%d path=%u ! videoconvert ! x264enc tune=zerolatency ! rtph264pay ! rtph264depay ! avdec_h264 ! xvimagesink" % (
    # gst_command = "pipewiresrc fd=%d path=%u ! videoconvert ! rtpvrawpay ! application/x-rtp, media=(string)video, clock-rate=(int)90000, encoding-name=(string)RAW, sampling=(string)BGR, depth=(string)8, width=(string)1920, height=(string)1200, colorimetry=(string)SMPTE240M, payload=(int)96, ssrc=(uint)1096418925, timestamp-offset=(uint)4132974598, seqnum-offset=(uint)32248, a-framerate=(string)60.002223968505859 ! rtpvrawdepay ! videoconvert ! xvimagesink" % (fd, node_id)
    # gst_command = "pipewiresrc fd=%d path=%u ! videoconvert ! rtpvrawpay ! rtpvrawdepay ! xvimagesink"
    # gst_command = "pipewiresrc fd=%d path=%u ! videoconvert ! video/x-raw,format=I420 ! jpegenc ! rtpjpegpay ! rtpjpegdepay ! jpegdec ! xvimagesink"
    # gst_command = "pipewiresrc fd=%d path=%u ! videoconvert ! x264enc pass=qual quantizer=21 tune=zerolatency bitrate=1000 ! rtph264pay ! rtph264depay ! avdec_h264 ! xvimagesink" % (fd, node_id)
    gst_command = gst_command % (fd, node_id)

    pipeline = Gst.parse_launch(gst_command)

    if args.remote_udp:
        def pad_probe_cb(pad, info, user_data):
            caps = pad.get_current_caps()
            if caps:
                if args.mjpeg:
                    print(
                        f"Command: gst-launch-1.0 udpsrc port=5000 buffer-size={net_core_rmem_max} caps='{caps.to_string()}' ! rtpjpegdepay ! jpegdec ! videoconvert ! autovideosink"
                    )
                else:
                    print(
                        f"Command: gst-launch-1.0 udpsrc port=5000 buffer-size={net_core_rmem_max} caps='{caps.to_string()}' ! rtpvrawdepay ! videoconvert ! autovideosink"
                    )
            return Gst.PadProbeReturn.PASS

        udpsink = pipeline.get_by_name("pay0")
        srcpad = udpsink.get_static_pad("src")
        srcpad.add_probe(Gst.PadProbeType.EVENT_DOWNSTREAM, pad_probe_cb, None)

    pipeline.set_state(Gst.State.PLAYING)
    pbus = pipeline.get_bus()
    pbus.add_signal_watch()
    pbus.connect("message", on_gst_message)


def on_start_response(response, results):
    if response != 0:
        print("Failed to start: %s" % response)
        terminate()
        return

    print("streams:")
    for node_id, stream_properties in results["streams"]:
        print("stream {}".format(node_id))
        play_pipewire_stream(node_id)


def on_select_sources_response(response, results):
    if response != 0:
        print("Failed to select sources: %d" % response)
        terminate()
        return

    print("sources selected")
    global session
    screen_cast_call(portal.Start, on_start_response, session, "")


def on_create_session_response(response, results):
    if response != 0:
        print("Failed to create session: %d" % response)
        terminate()
        return

    global session
    session = results["session_handle"]
    print("session %s created" % session)

    screen_cast_call(
        portal.SelectSources,
        on_select_sources_response,
        session,
        # types 1 | 2: AvailableSourceTypes with MONITOR | WINDOW
        options={
            "multiple": False,
            "types": dbus.UInt32(1 | 2),
            "cursor_mode": show_cursor,
        },
    )


portal = bus.get_object(
    "org.freedesktop.portal.Desktop", "/org/freedesktop/portal/desktop"
)


def start_screen_cast():
    (session_path, session_token) = new_session_path()
    screen_cast_call(
        portal.CreateSession,
        on_create_session_response,
        options={"session_handle_token": session_token},
    )


start_screen_cast()

try:
    loop.run()
except KeyboardInterrupt:
    terminate()
```

```bash title=/usr/bin/wemeet_wayland
#!/bin/sh -e

# Start xwayland
# https://aur.archlinux.org/packages/xwayland-standalone-with-libdecor
echo "Starting Xwayland"
Xwayland-standalone :114 -ac -retro +extension RANDR +extension RENDER +extension GLX +extension XVideo +extension DOUBLE-BUFFER +extension SECURITY +extension DAMAGE +extension X-Resource -extension XINERAMA -xinerama -extension MIT-SHM +extension Composite +extension COMPOSITE -extension XTEST -tst -dpms -s off -decorate -geometry 1920x1080 &

echo "Waiting for X server to be ready"
while ! xdpyinfo -display :114 >/dev/null 2>&1; do
    sleep 1
done

# Start openbox and wemeet
echo "Starting openbox"
DISPLAY=:114 openbox &

echo "Starting wemeet"
DISPLAY=:114 wemeet-x11
```



## 配置

```bash title=~/.config/openbox/rc.xml
<?xml version="1.0" encoding="UTF-8"?>

<!-- Do not edit this file, it will be overwritten on install.
        Copy the file to $HOME/.config/openbox/ instead. -->

<openbox_config xmlns="http://openbox.org/3.4/rc"
		xmlns:xi="http://www.w3.org/2001/XInclude">

<resistance>
  <strength>10</strength>
  <screen_edge_strength>20</screen_edge_strength>
</resistance>

<focus>
  <focusNew>yes</focusNew>
  <!-- always try to focus new windows when they appear. other rules do
       apply -->
  <followMouse>no</followMouse>
  <!-- move focus to a window when you move the mouse into it -->
  <focusLast>yes</focusLast>
  <!-- focus the last used window when changing desktops, instead of the one
       under the mouse pointer. when followMouse is enabled -->
  <underMouse>no</underMouse>
  <!-- move focus under the mouse, even when the mouse is not moving -->
  <focusDelay>200</focusDelay>
  <!-- when followMouse is enabled, the mouse must be inside the window for
       this many milliseconds (1000 = 1 sec) before moving focus to it -->
  <raiseOnFocus>no</raiseOnFocus>
  <!-- when followMouse is enabled, and a window is given focus by moving the
       mouse into it, also raise the window -->
</focus>

<placement>
  <policy>Smart</policy>
  <!-- 'Smart' or 'UnderMouse' -->
  <center>yes</center>
  <!-- whether to place windows in the center of the free area found or
       the top left corner -->
  <monitor>Primary</monitor>
  <!-- with Smart placement on a multi-monitor system, try to place new windows
       on: 'Any' - any monitor, 'Mouse' - where the mouse is, 'Active' - where
       the active window is, 'Primary' - only on the primary monitor -->
  <primaryMonitor>1</primaryMonitor>
  <!-- The monitor where Openbox should place popup dialogs such as the
       focus cycling popup, or the desktop switch popup.  It can be an index
       from 1, specifying a particular monitor.  Or it can be one of the
       following: 'Mouse' - where the mouse is, or
                  'Active' - where the active window is -->
</placement>

<theme>
  <name>Clearlooks</name>
  <titleLayout>NLIMC</titleLayout>
  <!--
      available characters are NDSLIMC, each can occur at most once.
      N: window icon
      L: window label (AKA title).
      I: iconify
      M: maximize
      C: close
      S: shade (roll up/down)
      D: omnipresent (on all desktops).
  -->
  <keepBorder>yes</keepBorder>
  <animateIconify>yes</animateIconify>
  <font place="ActiveWindow">
    <name>sans</name>
    <size>16</size>
    <!-- font size in points -->
    <weight>bold</weight>
    <!-- 'bold' or 'normal' -->
    <slant>normal</slant>
    <!-- 'italic' or 'normal' -->
  </font>
  <font place="InactiveWindow">
    <name>sans</name>
    <size>16</size>
    <!-- font size in points -->
    <weight>bold</weight>
    <!-- 'bold' or 'normal' -->
    <slant>normal</slant>
    <!-- 'italic' or 'normal' -->
  </font>
  <font place="MenuHeader">
    <name>sans</name>
    <size>16</size>
    <!-- font size in points -->
    <weight>normal</weight>
    <!-- 'bold' or 'normal' -->
    <slant>normal</slant>
    <!-- 'italic' or 'normal' -->
  </font>
  <font place="MenuItem">
    <name>sans</name>
    <size>16</size>
    <!-- font size in points -->
    <weight>normal</weight>
    <!-- 'bold' or 'normal' -->
    <slant>normal</slant>
    <!-- 'italic' or 'normal' -->
  </font>
  <font place="ActiveOnScreenDisplay">
    <name>sans</name>
    <size>16</size>
    <!-- font size in points -->
    <weight>bold</weight>
    <!-- 'bold' or 'normal' -->
    <slant>normal</slant>
    <!-- 'italic' or 'normal' -->
  </font>
  <font place="InactiveOnScreenDisplay">
    <name>sans</name>
    <size>16</size>
    <!-- font size in points -->
    <weight>bold</weight>
    <!-- 'bold' or 'normal' -->
    <slant>normal</slant>
    <!-- 'italic' or 'normal' -->
  </font>
</theme>

<desktops>
  <!-- this stuff is only used at startup, pagers allow you to change them
       during a session

       these are default values to use when other ones are not already set
       by other applications, or saved in your session

       use obconf if you want to change these without having to log out
       and back in -->
  <number>4</number>
  <firstdesk>1</firstdesk>
  <names>
    <!-- set names up here if you want to, like this:
    <name>desktop 1</name>
    <name>desktop 2</name>
    -->
  </names>
  <popupTime>875</popupTime>
  <!-- The number of milliseconds to show the popup for when switching
       desktops.  Set this to 0 to disable the popup. -->
</desktops>

<resize>
  <drawContents>yes</drawContents>
  <popupShow>Nonpixel</popupShow>
  <!-- 'Always', 'Never', or 'Nonpixel' (xterms and such) -->
  <popupPosition>Center</popupPosition>
  <!-- 'Center', 'Top', or 'Fixed' -->
  <popupFixedPosition>
    <!-- these are used if popupPosition is set to 'Fixed' -->

    <x>10</x>
    <!-- positive number for distance from left edge, negative number for
         distance from right edge, or 'Center' -->
    <y>10</y>
    <!-- positive number for distance from top edge, negative number for
         distance from bottom edge, or 'Center' -->
  </popupFixedPosition>
</resize>

<!-- You can reserve a portion of your screen where windows will not cover when
     they are maximized, or when they are initially placed.
     Many programs reserve space automatically, but you can use this in other
     cases. -->
<margins>
  <top>0</top>
  <bottom>0</bottom>
  <left>0</left>
  <right>0</right>
</margins>

<dock>
  <position>TopLeft</position>
  <!-- (Top|Bottom)(Left|Right|)|Top|Bottom|Left|Right|Floating -->
  <floatingX>0</floatingX>
  <floatingY>0</floatingY>
  <noStrut>no</noStrut>
  <stacking>Above</stacking>
  <!-- 'Above', 'Normal', or 'Below' -->
  <direction>Vertical</direction>
  <!-- 'Vertical' or 'Horizontal' -->
  <autoHide>no</autoHide>
  <hideDelay>300</hideDelay>
  <!-- in milliseconds (1000 = 1 second) -->
  <showDelay>300</showDelay>
  <!-- in milliseconds (1000 = 1 second) -->
  <moveButton>Middle</moveButton>
  <!-- 'Left', 'Middle', 'Right' -->
</dock>

<keyboard>
  <chainQuitKey>C-g</chainQuitKey>

  <!-- Keybindings for desktop switching -->
  <keybind key="C-A-Left">
    <action name="GoToDesktop"><to>left</to><wrap>no</wrap></action>
  </keybind>
  <keybind key="C-A-Right">
    <action name="GoToDesktop"><to>right</to><wrap>no</wrap></action>
  </keybind>
  <keybind key="C-A-Up">
    <action name="GoToDesktop"><to>up</to><wrap>no</wrap></action>
  </keybind>
  <keybind key="C-A-Down">
    <action name="GoToDesktop"><to>down</to><wrap>no</wrap></action>
  </keybind>
  <keybind key="S-A-Left">
    <action name="SendToDesktop"><to>left</to><wrap>no</wrap></action>
  </keybind>
  <keybind key="S-A-Right">
    <action name="SendToDesktop"><to>right</to><wrap>no</wrap></action>
  </keybind>
  <keybind key="S-A-Up">
    <action name="SendToDesktop"><to>up</to><wrap>no</wrap></action>
  </keybind>
  <keybind key="S-A-Down">
    <action name="SendToDesktop"><to>down</to><wrap>no</wrap></action>
  </keybind>
  <keybind key="W-F1">
    <action name="GoToDesktop"><to>1</to></action>
  </keybind>
  <keybind key="W-F2">
    <action name="GoToDesktop"><to>2</to></action>
  </keybind>
  <keybind key="W-F3">
    <action name="GoToDesktop"><to>3</to></action>
  </keybind>
  <keybind key="W-F4">
    <action name="GoToDesktop"><to>4</to></action>
  </keybind>
  <keybind key="W-d">
    <action name="ToggleShowDesktop"/>
  </keybind>

  <!-- Keybindings for windows -->
  <keybind key="A-F4">
    <action name="Close"/>
  </keybind>
  <keybind key="A-Escape">
    <action name="Lower"/>
    <action name="FocusToBottom"/>
    <action name="Unfocus"/>
  </keybind>
  <keybind key="A-space">
    <action name="ShowMenu"><menu>client-menu</menu></action>
  </keybind>

  <!-- Keybindings for window switching -->
  <keybind key="A-F1">
    <action name="NextWindow">
      <finalactions>
        <action name="Focus"/>
        <action name="Raise"/>
        <action name="Unshade"/>
      </finalactions>
    </action>
  </keybind>
  <keybind key="A-S-F1">
    <action name="PreviousWindow">
      <finalactions>
        <action name="Focus"/>
        <action name="Raise"/>
        <action name="Unshade"/>
      </finalactions>
    </action>
  </keybind>
  <keybind key="C-A-Tab">
    <action name="NextWindow">
      <panels>yes</panels><desktop>yes</desktop>
      <finalactions>
        <action name="Focus"/>
        <action name="Raise"/>
        <action name="Unshade"/>
      </finalactions>
    </action>
  </keybind>

  <!-- Keybindings for window switching with the arrow keys -->
  <keybind key="W-S-Right">
    <action name="DirectionalCycleWindows">
      <direction>right</direction>
    </action>
  </keybind>
  <keybind key="W-S-Left">
    <action name="DirectionalCycleWindows">
      <direction>left</direction>
    </action>
  </keybind>
  <keybind key="W-S-Up">
    <action name="DirectionalCycleWindows">
      <direction>up</direction>
    </action>
  </keybind>
  <keybind key="W-S-Down">
    <action name="DirectionalCycleWindows">
      <direction>down</direction>
    </action>
  </keybind>

  <!-- Keybindings for running applications -->
  <keybind key="W-e">
    <action name="Execute">
      <startupnotify>
        <enabled>true</enabled>
        <name>Konqueror</name>
      </startupnotify>
      <command>kfmclient openProfile filemanagement</command>
    </action>
  </keybind>
</keyboard>

<mouse>
  <dragThreshold>1</dragThreshold>
  <!-- number of pixels the mouse must move before a drag begins -->
  <doubleClickTime>500</doubleClickTime>
  <!-- in milliseconds (1000 = 1 second) -->
  <screenEdgeWarpTime>400</screenEdgeWarpTime>
  <!-- Time before changing desktops when the pointer touches the edge of the
       screen while moving a window, in milliseconds (1000 = 1 second).
       Set this to 0 to disable warping -->
  <screenEdgeWarpMouse>false</screenEdgeWarpMouse>
  <!-- Set this to TRUE to move the mouse pointer across the desktop when
       switching due to hitting the edge of the screen -->

  <context name="Frame">
    <mousebind button="A-Left" action="Press">
      <action name="Focus"/>
      <action name="Raise"/>
    </mousebind>
    <mousebind button="A-Left" action="Click">
      <action name="Unshade"/>
    </mousebind>
    <mousebind button="A-Left" action="Drag">
      <action name="Move"/>
    </mousebind>

    <mousebind button="A-Right" action="Press">
      <action name="Focus"/>
      <action name="Raise"/>
      <action name="Unshade"/>
    </mousebind>
    <mousebind button="A-Right" action="Drag">
      <action name="Resize"/>
    </mousebind> 

    <mousebind button="A-Middle" action="Press">
      <action name="Lower"/>
      <action name="FocusToBottom"/>
      <action name="Unfocus"/>
    </mousebind>

    <mousebind button="A-Up" action="Click">
      <action name="GoToDesktop"><to>previous</to></action>
    </mousebind>
    <mousebind button="A-Down" action="Click">
      <action name="GoToDesktop"><to>next</to></action>
    </mousebind>
    <mousebind button="C-A-Up" action="Click">
      <action name="GoToDesktop"><to>previous</to></action>
    </mousebind>
    <mousebind button="C-A-Down" action="Click">
      <action name="GoToDesktop"><to>next</to></action>
    </mousebind>
    <mousebind button="A-S-Up" action="Click">
      <action name="SendToDesktop"><to>previous</to></action>
    </mousebind>
    <mousebind button="A-S-Down" action="Click">
      <action name="SendToDesktop"><to>next</to></action>
    </mousebind>
  </context>

  <context name="Titlebar">
    <mousebind button="Left" action="Drag">
      <action name="Move"/>
    </mousebind>
    <mousebind button="Left" action="DoubleClick">
      <action name="ToggleMaximize"/>
    </mousebind>

    <mousebind button="Up" action="Click">
      <action name="if">
        <shaded>no</shaded>
        <then>
          <action name="Shade"/>
          <action name="FocusToBottom"/>
          <action name="Unfocus"/>
          <action name="Lower"/>
        </then>
      </action>
    </mousebind>
    <mousebind button="Down" action="Click">
      <action name="if">
        <shaded>yes</shaded>
        <then>
          <action name="Unshade"/>
          <action name="Raise"/>
        </then>
      </action>
    </mousebind>
  </context>

  <context name="Titlebar Top Right Bottom Left TLCorner TRCorner BRCorner BLCorner">
    <mousebind button="Left" action="Press">
      <action name="Focus"/>
      <action name="Raise"/>
      <action name="Unshade"/>
    </mousebind>

    <mousebind button="Middle" action="Press">
      <action name="Lower"/>
      <action name="FocusToBottom"/>
      <action name="Unfocus"/>
    </mousebind>

    <mousebind button="Right" action="Press">
      <action name="Focus"/>
      <action name="Raise"/>
      <action name="ShowMenu"><menu>client-menu</menu></action>
    </mousebind>
  </context>

  <context name="Top">
    <mousebind button="Left" action="Drag">
      <action name="Resize"><edge>top</edge></action>
    </mousebind>
  </context>

  <context name="Left">
    <mousebind button="Left" action="Drag">
      <action name="Resize"><edge>left</edge></action>
    </mousebind>
  </context>

  <context name="Right">
    <mousebind button="Left" action="Drag">
      <action name="Resize"><edge>right</edge></action>
    </mousebind>
  </context>

  <context name="Bottom">
    <mousebind button="Left" action="Drag">
      <action name="Resize"><edge>bottom</edge></action>
    </mousebind>

    <mousebind button="Right" action="Press">
      <action name="Focus"/>
      <action name="Raise"/>
      <action name="ShowMenu"><menu>client-menu</menu></action>
    </mousebind>
  </context>

  <context name="TRCorner BRCorner TLCorner BLCorner">
    <mousebind button="Left" action="Press">
      <action name="Focus"/>
      <action name="Raise"/>
      <action name="Unshade"/>
    </mousebind>
    <mousebind button="Left" action="Drag">
      <action name="Resize"/>
    </mousebind>
  </context>

  <context name="Client">
    <mousebind button="Left" action="Press">
      <action name="Focus"/>
      <action name="Raise"/>
    </mousebind>
    <mousebind button="Middle" action="Press">
      <action name="Focus"/>
      <action name="Raise"/>
    </mousebind>
    <mousebind button="Right" action="Press">
      <action name="Focus"/>
      <action name="Raise"/>
    </mousebind>
  </context>

  <context name="Icon">
    <mousebind button="Left" action="Press">
      <action name="Focus"/>
      <action name="Raise"/>
      <action name="Unshade"/>
      <action name="ShowMenu"><menu>client-menu</menu></action>
    </mousebind>
    <mousebind button="Right" action="Press">
      <action name="Focus"/>
      <action name="Raise"/>
      <action name="ShowMenu"><menu>client-menu</menu></action>
    </mousebind>
  </context>

  <context name="AllDesktops">
    <mousebind button="Left" action="Press">
      <action name="Focus"/>
      <action name="Raise"/>
      <action name="Unshade"/>
    </mousebind>
    <mousebind button="Left" action="Click">
      <action name="ToggleOmnipresent"/>
    </mousebind>
  </context>

  <context name="Shade">
    <mousebind button="Left" action="Press">
      <action name="Focus"/>
      <action name="Raise"/>
    </mousebind>
    <mousebind button="Left" action="Click">
      <action name="ToggleShade"/>
    </mousebind>
  </context>

  <context name="Iconify">
    <mousebind button="Left" action="Press">
      <action name="Focus"/>
      <action name="Raise"/>
    </mousebind>
    <mousebind button="Left" action="Click">
      <action name="Iconify"/>
    </mousebind>
  </context>

  <context name="Maximize">
    <mousebind button="Left" action="Press">
      <action name="Focus"/>
      <action name="Raise"/>
      <action name="Unshade"/>
    </mousebind>
    <mousebind button="Middle" action="Press">
      <action name="Focus"/>
      <action name="Raise"/>
      <action name="Unshade"/>
    </mousebind>
    <mousebind button="Right" action="Press">
      <action name="Focus"/>
      <action name="Raise"/>
      <action name="Unshade"/>
    </mousebind>
    <mousebind button="Left" action="Click">
      <action name="ToggleMaximize"/>
    </mousebind>
    <mousebind button="Middle" action="Click">
      <action name="ToggleMaximize"><direction>vertical</direction></action>
    </mousebind>
    <mousebind button="Right" action="Click">
      <action name="ToggleMaximize"><direction>horizontal</direction></action>
    </mousebind>
  </context>

  <context name="Close">
    <mousebind button="Left" action="Press">
      <action name="Focus"/>
      <action name="Raise"/>
      <action name="Unshade"/>
    </mousebind>
    <mousebind button="Left" action="Click">
      <action name="Close"/>
    </mousebind>
  </context>

  <context name="Desktop">
    <mousebind button="Up" action="Click">
      <action name="GoToDesktop"><to>previous</to></action>
    </mousebind>
    <mousebind button="Down" action="Click">
      <action name="GoToDesktop"><to>next</to></action>
    </mousebind>

    <mousebind button="A-Up" action="Click">
      <action name="GoToDesktop"><to>previous</to></action>
    </mousebind>
    <mousebind button="A-Down" action="Click">
      <action name="GoToDesktop"><to>next</to></action>
    </mousebind>
    <mousebind button="C-A-Up" action="Click">
      <action name="GoToDesktop"><to>previous</to></action>
    </mousebind>
    <mousebind button="C-A-Down" action="Click">
      <action name="GoToDesktop"><to>next</to></action>
    </mousebind>

    <mousebind button="Left" action="Press">
      <action name="Focus"/>
      <action name="Raise"/>
    </mousebind>
    <mousebind button="Right" action="Press">
      <action name="Focus"/>
      <action name="Raise"/>
    </mousebind>
  </context>

  <context name="Root">
    <!-- Menus -->
    <mousebind button="Middle" action="Press">
      <action name="ShowMenu"><menu>client-list-combined-menu</menu></action>
    </mousebind> 
    <mousebind button="Right" action="Press">
      <action name="ShowMenu"><menu>root-menu</menu></action>
    </mousebind>
  </context>

  <context name="MoveResize">
    <mousebind button="Up" action="Click">
      <action name="GoToDesktop"><to>previous</to></action>
    </mousebind>
    <mousebind button="Down" action="Click">
      <action name="GoToDesktop"><to>next</to></action>
    </mousebind>
    <mousebind button="A-Up" action="Click">
      <action name="GoToDesktop"><to>previous</to></action>
    </mousebind>
    <mousebind button="A-Down" action="Click">
      <action name="GoToDesktop"><to>next</to></action>
    </mousebind>
  </context>
</mouse>

<menu>
  <!-- You can specify more than one menu file in here and they are all loaded,
       just don't make menu ids clash or, well, it'll be kind of pointless -->

  <!-- default menu file (or custom one in $HOME/.config/openbox/) -->
  <file>menu.xml</file>
  <hideDelay>200</hideDelay>
  <!-- if a press-release lasts longer than this setting (in milliseconds), the
       menu is hidden again -->
  <middle>no</middle>
  <!-- center submenus vertically about the parent entry -->
  <submenuShowDelay>100</submenuShowDelay>
  <!-- time to delay before showing a submenu after hovering over the parent
       entry.
       if this is a negative value, then the delay is infinite and the
       submenu will not be shown until it is clicked on -->
  <submenuHideDelay>400</submenuHideDelay>
  <!-- time to delay before hiding a submenu when selecting another
       entry in parent menu
       if this is a negative value, then the delay is infinite and the
       submenu will not be hidden until a different submenu is opened -->
  <showIcons>yes</showIcons>
  <!-- controls if icons appear in the client-list-(combined-)menu -->
  <manageDesktops>yes</manageDesktops>
  <!-- show the manage desktops section in the client-list-(combined-)menu -->
</menu>

<applications>
<!--
  # this is an example with comments through out. use these to make your
  # own rules, but without the comments of course.
  # you may use one or more of the name/class/role/title/type rules to specify
  # windows to match

  <application name="the window's _OB_APP_NAME property (see obxprop)"
              class="the window's _OB_APP_CLASS property (see obxprop)"
          groupname="the window's _OB_APP_GROUP_NAME property (see obxprop)"
         groupclass="the window's _OB_APP_GROUP_CLASS property (see obxprop)"
               role="the window's _OB_APP_ROLE property (see obxprop)"
              title="the window's _OB_APP_TITLE property (see obxprop)"
               type="the window's _OB_APP_TYPE property (see obxprob)..
                      (if unspecified, then it is 'dialog' for child windows)">
  # you may set only one of name/class/role/title/type, or you may use more
  # than one together to restrict your matches.

  # the name, class, role, and title use simple wildcard matching such as those
  # used by a shell. you can use * to match any characters and ? to match
  # any single character.

  # the type is one of: normal, dialog, splash, utility, menu, toolbar, dock,
  #    or desktop

  # when multiple rules match a window, they will all be applied, in the
  # order that they appear in this list


    # each rule element can be left out or set to 'default' to specify to not 
    # change that attribute of the window

    <decor>yes</decor>
    # enable or disable window decorations

    <shade>no</shade>
    # make the window shaded when it appears, or not

    <position force="no">
      # the position is only used if both an x and y coordinate are provided
      # (and not set to 'default')
      # when force is "yes", then the window will be placed here even if it
      # says you want it placed elsewhere.  this is to override buggy
      # applications who refuse to behave
      <x>center</x>
      # a number like 50, or 'center' to center on screen. use a negative number
      # to start from the right (or bottom for <y>), ie -50 is 50 pixels from
      # the right edge (or bottom). use 'default' to specify using value
      # provided by the application, or chosen by openbox, instead.
      <y>200</y>
      <monitor>1</monitor>
      # specifies the monitor in a xinerama setup.
      # 1 is the first head, or 'mouse' for wherever the mouse is
    </position>

    <size>
      # the size to make the window.
      <width>20</width>
      # a number like 20, or 'default' to use the size given by the application.
      # you can use fractions such as 1/2 or percentages such as 75% in which
      # case the value is relative to the size of the monitor that the window
      # appears on.
      <height>30%</height>
    </size>

    <focus>yes</focus>
    # if the window should try be given focus when it appears. if this is set
    # to yes it doesn't guarantee the window will be given focus. some
    # restrictions may apply, but Openbox will try to

    <desktop>1</desktop>
    # 1 is the first desktop, 'all' for all desktops

    <layer>normal</layer>
    # 'above', 'normal', or 'below'

    <iconic>no</iconic>
    # make the window iconified when it appears, or not

    <skip_pager>no</skip_pager>
    # asks to not be shown in pagers

    <skip_taskbar>no</skip_taskbar>
    # asks to not be shown in taskbars. window cycling actions will also
    # skip past such windows

    <fullscreen>yes</fullscreen>
    # make the window in fullscreen mode when it appears

    <maximized>true</maximized>
    # 'Horizontal', 'Vertical' or boolean (yes/no)
  </application>

  # end of the example
-->
</applications>

</openbox_config>
```

```bash title=~/.config/openbox/menu.xml
<?xml version="1.0" encoding="UTF-8"?>

<openbox_menu xmlns="http://openbox.org/3.4/menu">

<menu id="apps-accessories-menu" label="Accessories">
  <item label="Screen sharing">
    <action name="Execute">
      <command>xdp-screen-cast --show-cursor</command>
    </action>
  </item>
</menu>

<menu id="apps-net-menu" label="Wemeet">
  <item label="Wemeet">
    <action name="Execute">
      <command>wemeet-x11</command>
    </action>
  </item>
</menu>

<menu id="system-menu" label="System">
  <!-- <item label="Openbox Configuration Manager">
    <action name="Execute">
      <command>obconf</command>
      <startupnotify><enabled>yes</enabled></startupnotify>
    </action>
  </item>
  <separator /> -->
  <item label="Reconfigure Openbox">
    <action name="Reconfigure" />
  </item>
</menu>

<menu id="root-menu" label="Openbox 3">
  <separator label="Applications" />
  <menu id="apps-accessories-menu"/>
  <menu id="apps-editors-menu"/>
  <menu id="apps-graphics-menu"/>
  <menu id="apps-net-menu"/>
  <menu id="apps-office-menu"/>
  <menu id="apps-multimedia-menu"/>
  <menu id="apps-term-menu"/>
  <menu id="apps-fileman-menu"/>
  <separator label="System" />
  <menu id="system-menu"/>
  <separator />
  <item label="Log Out">
    <action name="Exit">
      <prompt>yes</prompt>
    </action>
  </item>
</menu>

</openbox_menu>
```



## 使用

```bash
wemeet_wayland
```

Alt+F1 切换窗口

Alt+Shift+F1 切换上一个窗口

Alt+N 最小化

Ald+D 显示桌面

右键桌面空白在 Accessories 里找到屏幕共享



## 参考资料

https://blog.taoky.moe/2023-05-22/wemeet-screencast-in-wayland.html

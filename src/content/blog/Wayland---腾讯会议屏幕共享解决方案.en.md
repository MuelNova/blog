---
title: Wayland - 腾讯会议屏幕共享解决方案
description: Nova在这篇文章中分享了一种解决使用Wayland系统在腾讯会议中进行屏幕共享的问题的方案。他遇到的主要问题是，在使用Wayland时，只能看到鼠标指针，而不能正确地共享屏幕内容。通过一番搜索，他找到了一种比较优雅但稍有些复杂的解决方法，并决定在文中做简要记录。
pubDate: 2024-04-08
authors:
- nova

category: '[''arch'']'
---
During a team meeting, I tried to share my screen but only my mouse pointer was visible. In the end, it turned into using a robust phone camera solution, which was not ideal. After some searching, I found a relatively elegant (albeit twisted) solution, so I decided to document it briefly.

{/* truncate */}

## Installation

Install [Xwayland-standalone](https://aur.archlinux.org/packages/xwayland-standalone-with-libdecor) (which essentially configures xorg-xwayland with libdecor support) and [openbox](https://archlinux.org/packages/extra/x86_64/openbox/).

## Scripts

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
...
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

## Configuration

```````bash title=~/.config/openbox/rc.xml
<?xml version="1.0" encoding="UTF-8"?>
...
``````xml
<keyboard>
  <!-- Keybindings for window management -->
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

  <!-- Keybindings for window actions -->
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

  <!-- Keybindings for window switching with arrow keys -->
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
``````xml
ld try be given focus when it appears. if this is set
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
```````

```xml
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

## Usage

```bash
wemeet_wayland
```

Alt+F1: Switch windows

Alt+Shift+F1: Switch to the previous window

Alt+N: Minimize

Alt+D: Show desktop

Right-click on the blank desktop space and find Screen Sharing in Accessories

## Reference

https://blog.taoky.moe/2023-05-22/wemeet-screencast-in-wayland.html

```

:::info
This Content is generated by LLM and might be wrong / incomplete, refer to Chinese version if you find something wrong.
:::

{/* AI */}
```

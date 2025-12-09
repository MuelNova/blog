---
title: Hexo-Fluid下的live2d 3.x看板娘实现
description: 作者 nova 在文章中介绍了如何在 Hexo-Fluid 博客主题中集成 Live2D 版本 3.x 的看板娘（虚拟形象）。起初，nova
  觉得博客页面过于空旷，于是决定添加一个看板娘。文章详细描述了从最初的准备工作到最终实现的所有步骤。
pubDate: 2021-11-30
tags:
- Hexo
- live2d
- Investigate
authors:
- nova
---

# 引言

总感觉自己 Blog 太空了, 想搞个看板娘什么的。使用了 HEXO-live2d 发现只支持 Cubism2 版本的 live2d, 其他也是这样（看了下 Issues 好像是因为商用版权什么的）, 在官网看到了这个 SDK 所以尝试着`ctrl+c` `ctrl+v`了一下, 也没想到成功了:P

<!--truncate-->

# 准备工作

1. [Live2D Cubism SDK for Web](https://www.live2d.com/download/cubism-sdk/download-web/)

2. [Node.js](https://nodejs.org/zh-cn/)

3. TypeScript

   `npm install -g typescript`

# 开始爆改

### 测试方法

进入`\CubismSdkForWeb-x\Samples\TypeScript\Demo`文件夹，使用命令行输入：

```shell
npm install
npm run build
```

官方推荐使用 VS 进行，此时命令有所区别，详情请去[Github](https://github.com/Live2D/CubismWebSamples/blob/develop/Samples/TypeScript/README.md)查看。

此时会在`\dist\`下编译生成一个`bundle.js`, 在`index.html`中用于加载 live2d 模型。

接下来的地址若无特殊说明默认均在`\CubismSdkForWeb-x\Samples\TypeScript\Demo`文件夹下。

### 导入自己的模型

打开`\src\lappdefine.ts`文件, 找到如下代码：

```typescript
export const ResourcesPath = "../../Resources/";

// モデル定義---------------------------------------------
// モデルを配置したディレクトリ名の配列
// ディレクトリ名とmodel3.jsonの名前を一致させておくこと
export const ModelDir: string[] = ["Haru", "Hiyori", "Mark", "Natori", "Rice"];
```

这里定义了各个 live2d 模型的文件位置, 我们要做的就是把我们的模型放到代码中的`ResourcesPath`这个位置, 默认情况下也就是`\CubismSdkForWeb-4-r.3\Samples\Resources\`下, 并在`ModelDir`中添加我们的模型名字。

**值得注意的是**，我们需要把`.model3.json`的文件名改成与文件夹一致。

例如，我在资源文件夹下放入了`Nova`模型，现在目录结构是这样的:

```
|
├─Nova
│  │  86.cdi3.json
│  │  86.moc3
│  │  86.model3.json
│  │  86.physics3.json
│  │  cc_86.cfg
│  │
│  └─86.4096
│          texture_00.png
├─Other_Models
```

那么我**只需要**将`86.model3.json`文件更名为`Nova.model3.json`即可。

此时你的目录结构应该是：

```
|
├─Nova
│  │  86.cdi3.json
│  │  86.moc3
│  │  Nova.model3.json
│  │  86.physics3.json
│  │  cc_86.cfg
│  │
│  └─86.4096
│          texture_00.png
├─Other_Models
```

而你的`\src\lappdefine.ts`文件的`ModelDir`字符串数组中也应该包含了`"Nova"`这一元素。

再次编译并运行本地服务器, 你现在应该能看到刚才导入的模型了。

> 你可以使用第三方工具如`Visual Studio`或`WebStorm`打开本地服务器，或者在命令行输入`npm run start`后打开所示的网址, 进入`Demo`文件夹预览。

![烧啊](https://oss.nova.gal/img/image-20211007214102328.png)

> [皮](https://t.bilibili.com/485722661869867718?tab=2)来自石油佬的奉献

## 修改模型跟随鼠标移动

SDK 中默认看板娘是按住`鼠标左键/鼠标右键`才会跟随的，我们接下来的操作就是把它变成跟随鼠标移动的。

打开`\src\lappdelegate.ts`文件， 找到以下代码:

```typescript
const supportTouch: boolean = "ontouchend" in canvas;

if (supportTouch) {
  // タッチ関連コールバック関数登録
  canvas.ontouchstart = onTouchBegan;
  canvas.ontouchmove = onTouchMoved;
  canvas.ontouchend = onTouchEnded;
  canvas.ontouchcancel = onTouchCancel;
} else {
  // マウス関連コールバック関数登録
  canvas.onmousedown = onClickBegan;
  canvas.onmousemove = onMouseMoved;
  canvas.onmouseup = onClickEnded;
}
```

注释掉，添加鼠标移动事件

```typescript
document.addEventListener("mousemove", function (e) {
  const rect = canvas.getBoundingClientRect();
  const posX: number = e.clientX - rect.left;
  const posY: number = e.clientY - rect.top;
  LAppDelegate.getInstance()._view.onTouchesMoved(posX, posY);
});
// 其实就是把onMouseMoved()复制了一遍
```

此时发现无法进行点击之类的动作, 所以我们把`onmouseup`添加回来

在上面的代码下添加：

```typescript
canvas.onmouseup = onClickEnded;

// 为了美观，我又添加了一个移出浏览器归位的事件
document.addEventListener("mouseout", function (e) {
  const live2DManager: LAppLive2DManager = LAppLive2DManager.getInstance();
  live2DManager.onDrag(0.0, 0.0);
});
```

再次测试，已经可以正常使用了。

## 绘制 canvas

为了去除 canvas 中的背景, 我们打开`\src\lappview.ts`, 找到图像创建的方法注释掉

```typescript
public initializeSprite(): void {
    const width: number = canvas.width;
    const height: number = canvas.height;

    const textureManager = LAppDelegate.getInstance().getTextureManager();
    const resourcesPath = LAppDefine.ResourcesPath;

    /*let imageName = '';

    // 背景画像初期化
    imageName = LAppDefine.BackImageName;

    // 非同期なのでコールバック関数を作成
    const initBackGroundTexture = (textureInfo: TextureInfo): void => {
      const x: number = width * 0.5;
      const y: number = height * 0.5;

      const fwidth = textureInfo.width * 2.0;
      const fheight = height * 0.95;
      this._back = new LAppSprite(x, y, fwidth, fheight, textureInfo.id);
    };

    textureManager.createTextureFromPngFile(
      resourcesPath + imageName,
      false,
      initBackGroundTexture
    );

    // 歯車画像初期化
    imageName = LAppDefine.GearImageName;
    const initGearTexture = (textureInfo: TextureInfo): void => {
      const x = width - textureInfo.width * 0.5;
      const y = height - textureInfo.height * 0.5;
      const fwidth = textureInfo.width;
      const fheight = textureInfo.height;
      this._gear = new LAppSprite(x, y, fwidth, fheight, textureInfo.id);
    };

    textureManager.createTextureFromPngFile(
      resourcesPath + imageName,
      false,
      initGearTexture
    );*/

	/*if (this._gear.isHit(pointX, pointY)) {
      live2DManager.nextScene();
    }*/

```

重新测试后发现先背景为全黑, 打开`\src\lappdelegate.ts`, 将背景透明度改为`0`

```typescript
  public run(): void {
    // メインループ
    const loop = (): void => {
      // インスタンスの有無の確認
      if (s_instance == null) {
        return;
      }

      // 時間更新
      LAppPal.updateTime();

      // 画面の初期化
      gl.clearColor(0.0, 0.0, 0.0, 0.0); //将gl.clearColor(0.0, 0.0, 0.0, 1.0)的alpha修改为0.0
```

接下来就是对 live2d 模型布局的一个自定义, 这里直接套用了 live2d 2.x 版本的[Live2D](https://github.com/galnetwen/Live2D)项目

> 该项目里的`js/live2d.js`即为`dist`目录下的`bundle.js`, 因此我们应该对`demo.html`做一些修改

## 最终的修改

打开`\src\lappdelegate.ts`, 将`initialize()`中的`canvas`进行变动:

```typescript
public initialize(): boolean {
    // キャンバスの作成
    // canvas = document.createElement('canvas');
    canvas = <HTMLCanvasElement>document.getElementById('live2d') // 需要与custom_html里的canvas的id对应
    if (LAppDefine.CanvasSize === 'auto') {
      this._resizeCanvas();
    } else {
      // canvas.width = LAppDefine.CanvasSize.width;
      // canvas.height = LAppDefine.CanvasSize.height;
    }
...
	// キャンバスを DOM に追加
    //document.body.appendChild(canvas);

  private _resizeCanvas(): void {
    // canvas.width = window.innerWidth;
    // canvas.height = window.innerHeight;
  }

```

把[Live2D](https://github.com/galnetwen/Live2D)克隆出来的`live2d`文件夹放入`hexo`的`source`文件夹中, 再将先前编译的`\dist\bundle.js` 与`\CubismSdkForWeb-4-r.3\Core\live2dcubismcore.js`放入`source\live2d\js\`文件夹下, 最后找到`hexo根目录`下的`_config.fluid.yml`文件, 找到以下行:

```yml
# 自定义 <head> 节点中的 HTML 内容
# Customize <head> HTML content
custom_head:
```

添加上`demo.html`里的代码:

```html
<link rel="stylesheet" href="/live2d/css/live2d.css" />
```

类似的, 找到`custom_html`行添加代码:

```html
<div id="landlord">
  <div class="message" style="opacity:0"></div>
  <canvas id="live2d" width="280" height="250" class="live2d"></canvas>
  <!-- 如果你修改这里的id, 则对应JS的id也要改变 -->
  <div class="hide-button">隐藏</div>
</div>
<script
  type="text/javascript"
  src="https://cdn.bootcss.com/jquery/2.2.4/jquery.min.js"
></script>
<script type="text/javascript">
  var message_Path = "/live2d/";
  var home_Path = "https://haremu.com/"; //可以修改为自己的主页链接或者删除
</script>
<!--将 live2d.js 改为 bundle.js -->
<script type="text/javascript" src="./live2d/js/bundle.js"></script>
<!--引入live2d的core-->
<script type="text/javascript" src="./live2d/js/ive2dcubismcore.js"></script>

<script type="text/javascript" src="/live2d/js/message.js"></script>
```

最后, 我们使用命令`hexo clean && hexo g`即可在 blog 上看到我们的 live2d 人物

## 其它

### 如何修改大小与中心点

刚刚添加完看板娘你可能会发现看板娘特别特别小。这时候你可以打开`\CubismSdkForWeb-4-r.3\Framework\src\math\cubismmodelmatrix.ts`文件并修改:

```typescript
    /**
   * 横幅を設定
   *
   * @param w 横幅
   */
  public setWidth(w: number): void {
    const scaleX: number = w / this._width;
    const scaleY: number = scaleX;
    this.scale(scaleX*2, scaleY*2);
  }

  /**
   * 縦幅を設定
   * @param h 縦幅
   */
  public setHeight(h: number): void {
    const scaleX: number = h / this._height;
    const scaleY: number = scaleX;
    this.scale(scaleX*2, scaleY*2);
  }
  //你想放大多少倍就乘以多少即可

```

完成后重新编译`bundle.js`放入`source\live2d\js\`文件夹并重新部署`hexo`即可

### 后记

简单的修改并不能使看板娘趋于完美，你会遇到诸如**模型显示不全**、**模型无法交互**、**模型跟随鼠标诡异**等等问题, 解决方法也就是如上的删改源码, 自己添加实现。 由于精力有限实在是难以全部复述(毕竟写这个 blog 的时候看板娘已经部署好几个月了())

你可以研究[大佬已经做好的项目](https://github.com/cqc233/live2dDemo)得到上述问题的大部分解决方法, 添加了不少自定义方法以优化看板娘体验, 甚至做到开盖即用(甚至还有 BLOG 与视频, 比起我这个详细到不知道哪里去了~~所以我花大量时间写这个 BLOG 的意义在哪里~~)， 你可以前往[仰望星空的 sun](https://space.bilibili.com/42800229)了解更多。

~~人类存在的意义就是不断制造重复的轮子！~~

![通过各种自定义后的看板娘](https://oss.nova.gal/img/image-20211010114744975.png)

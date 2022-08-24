# WebAR.rocks.faceDepth

**Import your face in a 3D scene, in live!**

This JavaScript library:

1. Get the camera video stream,
2. Detects and track the user's face
3. Crop the face and evaluate the depth

All is done in real-time, in a standard web browser. We provide a THREE.js demo where the 3D face of the user is inserted into a 3D scene. However, this library is framework agnostic and can be user with any web 3D engine.


## Table of contents

* [Features](#features)
* [Architecture](#architecture)
* [Demonstrations](#demonstrations)
* [Specifications](#specifications)
  * [Get started](#get-started)
  * [Init arguments](#init-arguments)
  * [Error codes](#error-codes)
  * [Miscellaneous methods](#miscellaneous-methods)
  * [Optimization](#optimization)
* [Hosting](#hosting)
* [About the tech](#about-the-tech)
  * [Under the hood](#under-the-hood)
  * [Compatibility](#compatibility)
* [License](#license)
* [References](#references)


## Features

Here are the main features of the library:

* video acquisition,
* face detection,
* face tracking,
* face cropping,
* inference of face depth,
* global 3D face pose estimation,
* robust to difficult lighting conditions,
* mobile friendly.


## Architecture

* `/demos/`: demonstration source code,
* `/dist/`: core of the library: 
  * `WebARRocksFaceDepth.js`: main minified script,
  * `WebARRocksFaceDepth.module.js`: main minified script for module use (with `import` or `require`),
* `/helpers/`: scripts which can help you to use this library in some specific use cases,
  * `WebARRocksFaceDepthThreeHelper.js`: makes the bridge between *THREE.js* and this lib,
* `/neuralNets/`: neural networks models,
  * `NN_FACEDEPTH_DEPTH_<version>.json`: neural networks computing the depth from a face cropped image,
  * `NN_FACEDEPTH_TRACK_<version>.json`: neural networks detecting and tracking the face,
* `/libs/`: 3rd party libraries and 3D engines used in the demos,


## Demonstrations

Here are the demonstrations included in this repository:

* Three.js avatar: [live demo](https://webar.rocks/demos/faceDepth/demos/threeAvatar/), [source code](/demos/threeAvatar/)


## Specifications

### Get started

The best way to get started is to take at the demo.


### Init arguments

* `<function> callbackReady`: This function is called when the lib is initialized, with 2 argument: `<string|false> errorCode, <object> spec`. This function is called again if an error happens. The object `spec` has the following properties:

  * `GL`: the WebGL context. The rendering 3D engine should use this WebGL context,
  * `canvasElement`: the `<canvas>` element,
  * `videoTexture`: a WebGL texture displaying the camera video. It has the same resolution as the camera video,
  * `[<float>, <float>, <float>, <float>]` videoTransformMat2: flatten 2x2 matrix encoding a scaling and a rotation. We should apply this matrix to viewport coordinates to render `videoTexture` in the viewport,
  * `<HTMLVideoElement> video`: the video used as source for the webgl texture `videoTexture`,

* `<function> callbackTrack`: This function is called at each iteration loop, with an object as argument with these properties:
  * `<float> detected`: the face detection probability, between `0` and `1`,
  * `<boolean> isDetected`: whether the face is detected or not
  * `<float> x`, `<float> y`: The 2D coordinates of the center of the detection frame in the viewport (each between -1 and 1, `x` from left to right and `y` from bottom to top),
  * `<float> s`: the scale along the horizontal axis of the detection frame, between 0 and 1 (1 for the full width). The detection frame is always square,
  * `<float> rx`, `<float> ry`, `<float> rz`: the Euler angles of the head rotation in radians,
  * `<Uint8Array> RGBDBuf`: RGBD buffer of the face,
  * `<int> RGBDRes`: resolution of the RGBD buffer.  

* `<string> canvasId` or `<HTMLCanvasElement> canvas`: the canvas where the computation will be performed,
* `<string>NNTrackPath` or `<object> NNTrack`: the neural network model used for face detection and tracking,
* `<string>NNDepthPath` or `<object> NNDepth`: the neural network model used for depth inference,
* `<integer> animateDelay`: With this statement you can set accurately the number of milliseconds during which the browser wait at the end of the rendering loop before starting another detection. If you use the canvas of this library as a secondary element (for example in *PACMAN* or *EARTH NAVIGATION* demos) you should set a small `animateDelay` value (for example 2 milliseconds) in order to avoid rendering lags.
* `<function> onWebcamAsk`: Function launched just before asking for the user to allow its camera access,
* `<function> onWebcamGet`: Function launched just after the user has accepted to share its video. It is called with the video element as argument,
* `<dict> videoSettings`: override MediaStream API specified video settings, which are by default:

```javascript
{
  'videoElement' // not set by default. <video> element used
   // If you specify this parameter,
   // all other settings will be useless
   // it means that you fully handle the video aspect

  'deviceId'            // not set by default
  'facingMode': 'user', // to use the rear camera, set to 'environment'

  'idealWidth': 800,  // ideal video width in pixels
  'idealHeight': 600, // ideal video height in pixels
  'minWidth': 480,    // min video width in pixels
  'maxWidth': 1280,   // max video width in pixels
  'minHeight': 480,   // min video height in pixels
  'maxHeight': 1280,  // max video height in pixels,
  'rotate': 0         // rotation in degrees possible values: 0,90,-90,180
},
```

* `<dict> scanSettings`: overrides face scan settings - see `set_scanSettings(...)` method for more information.
* `<dict> stabilizationSettings`: overrides tracking stabilization settings - see `set_stabilizationSettings(...)` method for more information.
* `<boolean> isKeepRunningOnWinFocusLost`: Whether we should keep the detection loop running even if the user switches the browser tab or minimizes the browser window. Default value is `false`. This option is useful for a videoconferencing app, where a face mask should be still computed if the *FaceFilter* window is not the active window. Even with this option toggled on, the face tracking is still slowed down when the FaceFilter window is not active.


### Error codes

The initialization function ( `callbackReady` in the code snippet ) will be called with an error code ( `errCode` ). It can have these values:
* `false`: no error occurs,
* `"GL_INCOMPATIBLE"`: WebGL is not available, or this WebGL configuration is not enough (there is no WebGL2, or there is WebGL1 without OES_TEXTURE_FLOAT or OES_TEXTURE_HALF_FLOAT extension),
* `"ALREADY_INITIALIZED"`: the library has been already initialized,
* `"NO_CANVASID"`: no canvas ID was specified,
* `"INVALID_CANVASID"`: cannot find the `<canvas>` element in the DOM,
* `"INVALID_CANVASDIMENSIONS"`: the dimensions `width` and `height` of the canvas are not specified,
* `"WEBCAM_UNAVAILABLE"`: cannot get access to the camera (the user has no camera, or it has not accepted to share the device, or the camera is already busy),
* `"GLCONTEXT_LOST"`: The WebGL context was lost. If the context is lost after the initialization, the `callbackReady` function will be launched a second time with this value as error code,


### Miscellaneous methods

* `resize()`: should be called after resizing the `<canvas>` element to adapt the cut of the video,

* `toggle_pause(<boolean> isPause)`: pauses/resumes,

* `set_animateDelay(<integer> delay)`: Changes the `animateDelay` (see `init()` arguments),

* `set_inputTexture(<WebGLTexture> tex, <integer> width, <integer> height)`: Changes the video input by a WebGL Texture instance. The dimensions of the texture, in pixels, should be provided,

* `reset_inputTexture()`: Comes back to the user's video as input texture,

* `get_videoDevices(<function> callback)`: Should be called before the `init` method. 2 arguments are provided to the callback function:
  * `<array> mediaDevices`: an array with all the devices founds. Each device is a javascript object having a `deviceId` string attribute. This value can be provided to the `init` method to use a specific camera. If an error happens, this value is set to `false`,
  * `<string> errorLabel`: if an error happens, the label of the error. It can be: `NOTSUPPORTED`, `NODEVICESFOUND` or `PROMISEREJECTED`.

* `set_scanSettings(<object> scanSettings)`: Overrides scan settings. `scanSettings` is a dictionnary with the following properties:
  * `<float> threshold`: detection threshold, between `0` and `1`. Default value is `0.75`. You can decrease it if you want to make the detection more sensitive (but it will increase the false positive detections),
  * `<int> nDetectsPerLoop`: specifies the number of detections per drawing loop. `0` for adaptative value. Default: `0`
  * `<int> nScaleLevels`: number of detection steps for the scale. Default: `3`,
  * `[<float>, <float>, <float>] overlapFactors`: overlaps between 2 scan positions for `X`, `Y` and `scale`. Default: `[2, 2, 3]`,
  * `<float> scale0Factor`: scale factor for the largest scan level. Default is `0.8`.

* `set_stabilizationSettings(<object> stabilizationSettings)`: Overrides detection stabilization settings. The output of the neural network is always noisy, so we need to stabilize it using a floating average to avoid shaking artifacts. The internal algorithm computes first a stabilization factor `k` between `0` and `1`. If `k==0.0`, the detection is bad and we favor responsivity against stabilization. It happens when the user is moving quickly, rotating the head or when the detection is bad. On the contrary, if `k` is close to `1`, the detection is nice and the user does not move a lot so we can stabilize a lot. `stabilizationSettings` is a dictionnary with the following properties:
  * `[<float> minValue, <float> maxValue] translationFactorRange`: multiply `k` by a factor `kTranslation` depending on the translation speed of the head (relative to the viewport). `kTranslation=0` if `translationSpeed<minValue` and `kTranslation=1` if `translationSpeed>maxValue`. The regression is linear. Default value: `[0.0015, 0.005]`,
  * `[<float> minValue, <float> maxValue] rotationFactorRange`: analogous to `translationFactorRange` but for rotation speed. Default value: `[0.12, 0.25]`,
  * `[<float> minValue, <float> maxValue] qualityFactorRange`: analogous to `translationFactorRange` but for the head detection coefficient. Default value: `[0.85, 0.95]`,
  * `[<float> minValue, <float> maxValue] alphaRange`: it specifies how to apply `k`. Between 2 successive detections, we blend the previous `detectState` values with the current detection values using a mixing factor `alpha`. `alpha=<minValue>` if `k<0.0` and `alpha=<maxValue>` if `k>1.0`. Between the 2 values, the variation is quadratic. Default value is `[0.05, 0.9]`,
It only applies to global pose stabilization. Landmarks are stabilized using helpers (`/helpers/WebARRocksLMStabilizer<X>.js`).

* `update_videoElement(<video> vid, <function|False> callback)`: changes the video element used for the face detection (which can be provided via `VIDEOSETTINGS.videoElement`) by another video element. A callback function can be called when it is done.

* `update_videoSettings(<object> videoSettings)`: dynamically change the video settings (see [Optional init arguments](optional-init-arguments) for the properties of `videoSettings`). It is useful to change the camera from the selfie camera (user) to the back (environment) camera. A `Promise` is returned. If `videoSettings = null`, the video is stopped and the camera is toggled off.

* `destroy()`: Cleans both graphic memory and JavaScript memory, uninit the library. After that you need to init the library again. A `Promise` is returned.

* `is_winFocus()`: Return if the current window has focus or not (For example if the user has changed the browser tab if will return `false`). This function works only if init option `isKeepRunningOnWinFocusLost` is set to `true`.


## Hosting

You should host the content of this repository using a HTTPS static server.

Be careful to enable gzip HTTP/HTTPS compression for JSON and JS files. Indeed, the neuron network JSON file, `neuralNets/NN_<xxx>.json` is quite heavy, but very well compressed with GZIP. You can check the gzip compression of your server [here](https://checkgzipcompression.com/).


## About the tech

### Under the hood

This library relies on [WebAR.rocks](https://webar.rocks) WebGL Deep Learning technology to detect and track the user's face using a neural network. The accuracy is adaptative: the best is the hardware, the more detections are processed per second. All is done on the client-side.

### Compatibility

* If `WebGL2` is available, it uses `WebGL2` and no specific extension is required,
* If `WebGL2` is not available but `WebGL1`, we require either `OES_TEXTURE_FLOAT` extension or `OES_TEXTURE_HALF_FLOAT` extension,
* If `WebGL2` is not available, and if `WebGL1` is not available or neither `OES_TEXTURE_FLOAT` or `OES_HALF_TEXTURE_FLOAT` are implemented, the user is not compatible.

If a compatibility error is triggered, please post an issue on this repository. If this is a problem with the camera access, please first retry after closing all applications which could use your device (Skype, Messenger, other browser tabs and windows, ...). Please include:

* a screenshot of [webglreport.com - WebGL1](http://webglreport.com/?v=1) (about your `WebGL1` implementation),
* a screenshot of [webglreport.com - WebGL2](http://webglreport.com/?v=2) (about your `WebGL2` implementation),
* the log from the web console,
* the steps to reproduce the bug, and screenshots.


## License

This code repository is dual licensed. You have to choose between these 2 licenses:

1. [GPLv3](GPLv3.txt) (free default option)
2. Nominative commercial license: please contact-us for more information

For more information, please read the [LICENSE](/LICENSE) file.


## References

* [WebAR.rocks website](https://webar.rocks)
* [Webgl Academy: tutorials on WebGL and THREE.JS](http://www.webglacademy.com)
* [WebAR.rocks on Linkedin](https://www.linkedin.com/company/webar-rocks)
* [WebAR.rocks on Twitter](https://twitter.com/WebARRocks)
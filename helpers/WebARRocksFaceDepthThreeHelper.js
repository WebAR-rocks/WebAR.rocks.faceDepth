const NNPath = '../../neuralNets/';
const _defaultSpec = {
  displayVideoRes: 512,
  onFaceMeshReady: null,

  // rendering:
  depthScale: 0.4,
  maskTexturePath: 'faceMask.png',
  depthLightFallOffRange: [-1, 0.5], // first value: depth when light falloff is max, second: stop light falloff
  depthLightFallOffIntensity: 0.8, // 1 -> full effect, 0 -> no effect

  // neural network models:
  //NNTrackPath: '../../../../../../neuralNets/raw/faceDepth/faceDepthTrack0_2022-08-14_tmp.json',
  //NNDepthPath: '../../../../../../neuralNets/raw/faceDepth/faceDepth0_2022-08-21_5_1_tmp.json',
  NNTrackPath: NNPath + 'NN_FACEDEPTH_TRACK_1.json',
  NNDepthPath: NNPath + 'NN_FACEDEPTH_DEPTH_1.json',

  // face insertion:
  threeAvatarModel: null,
  threeFaceMeshName: "robotFace",
  faceScale: 1.0,
  faceOffset: [0, 0, 0],
  faceRx: 0,

  // neck rotation:
  neckBoneName: null,
  neckRotationFactors: [1, 1, 1],
  neckAmortizationFactor: 0.8 // 0 -> no amortization, 1 -> max amortization
};

import WEBARROCKSFACEDEPTH from '../dist/WebARRocksFaceDepth.moduleES6.js';
import {
  BufferAttribute,
  DataTexture,
  Euler,
  LinearFilter,
  Matrix4,
  Mesh,
  PlaneGeometry,
  ShaderMaterial,
  Skeleton,
  SkinnedMesh,
  TextureLoader,
  Vector2
  } from '../libs/three/v136/build/three.module.js';

let _spec = null;
let _cv = null;

let _isDisplayVideo = true;
let _isUpdateVideo = true;
let _timerHideVideo = null;

let _threeRGBDTexture = null, _threeGridMesh = null;
let _threeNeckBone = null, _threeNeckEuler = null, _threeNeckMat = null;
let _threeFaceMeshToReplace = null;


const _RGBDVertexShaderSource = `
  varying vec2 vUv;
  varying float vDepth;

  uniform float depthScale, res;
  uniform sampler2D tRGBD;

  #include <skinning_pars_vertex>

  void main() {
    vec3 transformed = position;
    vec2 uv = vec2(0.5) + position.xy;// + vec2(0.5) / res;

    // apply depth displacement:
    float depth = 2.0 * texture2D(tRGBD, uv).a - 1.0;
    transformed.z += depth * depthScale;

    #include <skinbase_vertex>
    #include <skinning_vertex>

    // output:
    vUv = uv;
    vDepth = depth;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(transformed, 1.0);
  }`;

const _RGBDFragmentShaderSource = `
  varying vec2 vUv;
  varying float vDepth;
  uniform sampler2D tRGBD, tMask;
  uniform vec2 depthLightFallOffRange;
  uniform float depthLightFallOffIntensity;

  void main() {
    float lightFallOff = smoothstep(depthLightFallOffRange.y, depthLightFallOffRange.x, vDepth);
    lightFallOff *= depthLightFallOffIntensity;
    float lightFallOffFactor = 1.0 - lightFallOff;

    float mask = texture2D(tMask, vUv).r;
    vec3 color = lightFallOffFactor * texture2D(tRGBD, vUv).rgb;
    
    gl_FragColor = vec4(color, mask);
  }
`;


function init_cv(){
  // create the canvas where the video will be displayed
  // and face computations will be done:
  _cv = document.createElement('canvas');
  _cv.width = _spec.displayVideoRes, _cv.height = _spec.displayVideoRes;
  document.body.appendChild(_cv);
  _cv.style.position = 'fixed';
  _cv.style.opacity = 1;
  _cv.style.pointerEvents = 'none';
  _cv.style.bottom = 0;
  _cv.style.right = 0;
  _cv.style.transition = 'all .2s ease-in-out';
  _cv.style.transformOrigin = 'bottom right'; 
  _cv.style.maxWidth = '25vw';
  _cv.style.maxHeight = '25vh';
}


function init_webArRocksDepth(){
  console.log('WEBARROCKSFACEDEPTH version: ' + WEBARROCKSFACEDEPTH.VERSION);

  return new Promise(function(accept, reject){
    WEBARROCKSFACEDEPTH.init({
      followZRot: true,
      isKeepRunningOnWinFocusLost: true,
      canvas: _cv,
      NNTrackPath: _spec.NNTrackPath,
      NNDepthPath: _spec.NNDepthPath,
      callbackReady: function(err, spec){
        if (err){
          reject('AN ERROR HAPPENS. ERR =', err);
          return;
        }

        console.log('INFO: FACEDEPTH IS READY');
        accept();
      },

      callbackTrack: callbackTrack
    }); //end WEBARROCKSFACEDEPTH.init call
  }); //end returned promise
}


function clear_timerHideVideo(){
  if (!_timerHideVideo){
    return;
  }
  clearTimeout(_timerHideVideo);
  _timerHideVideo = null;
}


function callbackTrack(detectState){
  if (_isDisplayVideo && detectState.isDetected){
    console.log('Face detected => Hide video');
    //_cv.style.transition = 'transform 0.2s';
    _cv.style.transform = 'scale(0.001)';
    _isDisplayVideo = false;
    _isUpdateVideo = true;
    clear_timerHideVideo()
    _timerHideVideo = setTimeout(function(){
      _isUpdateVideo = false;
      _cv.style.visible = 'hidden';
    }, 500);
  } else if (!_isDisplayVideo && !detectState.isDetected){
    console.log('Face lost => show video');
    _cv.style.visible = 'visible';
    
   // _cv.style.transition = 'transform 0.2s';
    _cv.style.transform = 'scale(1)';
    _isDisplayVideo = true;
    _isUpdateVideo = true;
    clear_timerHideVideo();
  }

  if (_isUpdateVideo){
    WEBARROCKSFACEDEPTH.render_video();
  }

  if (!detectState.isDetected){
    if (_threeFaceMeshToReplace && _threeGridMesh.visible){
      _threeFaceMeshToReplace.visible = true;
      _threeGridMesh.visible = false;
      if (_threeNeckBone){
        _threeNeckBone.matrixAutoUpdate = true;
      }
    }
    return;
  }
  if (_threeFaceMeshToReplace && !_threeGridMesh.visible){
    _threeFaceMeshToReplace.visible = false;
    _threeGridMesh.visible = true;
    if (_threeNeckBone){
      _threeNeckBone.matrixAutoUpdate = false;
    }
  }

  // update or create face depth texture:
  if (_threeRGBDTexture === null){
    _threeRGBDTexture = new DataTexture( detectState.RGBDBuf, detectState.RGBDRes, detectState.RGBDRes );
    _threeRGBDTexture.magFilter = LinearFilter;
    _threeRGBDTexture.minFilter = LinearFilter;
    _threeGridMesh = create_threeGridMesh(detectState.RGBDRes, _threeRGBDTexture, _spec.maskTexturePath);
    if (_spec.threeAvatarModel){
      insert_face();
    }
    if (_spec.onFaceMeshReady){
      _spec.onFaceMeshReady(_threeGridMesh);
    }
  }
  _threeRGBDTexture.needsUpdate = true;

  // update neck movement:
  if (_threeNeckBone !== null){
    const k  = _spec.neckAmortizationFactor;
    _threeNeckEuler.set(
      _threeNeckEuler.x * k + (1-k) * detectState['rx'] * _spec.neckRotationFactors[0],
      _threeNeckEuler.y * k + (1-k) * detectState['ry'] * _spec.neckRotationFactors[1],
      _threeNeckEuler.z * k + (1-k) * detectState['rz'] * _spec.neckRotationFactors[2], 'YZX');
  }
}


function copy_skinGeometryAttribute(attrName, srcMesh, dstMesh){
  // extract info:
  const dstGeom = dstMesh.geometry;
  const dstCount = dstGeom.attributes.position.count;
  const srcAttr = srcMesh.geometry.attributes[attrName];
  const itemSize = srcAttr.itemSize;
  
  // forge attribute array:
  const elt0 = srcAttr.array.slice(0, itemSize);
  const dstAttrArr = new srcAttr.array.constructor(dstCount * itemSize);
  for (let i=0; i<dstCount; ++i){
    for (let j=0; j<itemSize; ++j){
      dstAttrArr[i*itemSize + j] = elt0[j];
    }
  }

  // affect new attribute:
  const newAttr = new BufferAttribute(dstAttrArr, itemSize, false);
  dstGeom.setAttribute( attrName, newAttr );
}


function insert_face(){
  _spec.threeAvatarModel.traverse(function(threeNode){
    if (threeNode.name === _spec.threeFaceMeshName){
      _threeFaceMeshToReplace = threeNode;
    }
  });

  if (!_threeFaceMeshToReplace){
    console.log('WARNING in WebARRocksFaceDepthThreeHelper - insert_face(): cannot find a mesh which name is ', _spec.threeFaceMeshName);
    return;
  }

  const isSkinned = _threeFaceMeshToReplace.isSkinnedMesh;
  _threeFaceMeshToReplace.visible = false;

  // bind _threeGridMes with the skeleton if necessary:
  if(isSkinned){
    _threeGridMesh = new SkinnedMesh(_threeGridMesh.geometry, _threeGridMesh.material);
    _threeGridMesh.frustumCulled = false;
    // we cannot use the same skeleton for _threeGridMesh and _threeFaceMeshToReplace
    // or it makes weird bugs, so we create a new skeleton using the same bones:
    const threeSkeleton = new Skeleton(_threeFaceMeshToReplace.skeleton.bones);
    _threeGridMesh.bind(threeSkeleton);
    _threeGridMesh.bindMatrix.copy(_threeFaceMeshToReplace.bindMatrix);
    copy_skinGeometryAttribute('skinIndex', _threeFaceMeshToReplace, _threeGridMesh);
    copy_skinGeometryAttribute('skinWeight', _threeFaceMeshToReplace, _threeGridMesh);
  }

  // proceed the replacement and set the pose:
  const threeFaceMeshParent = _threeFaceMeshToReplace.parent;
  threeFaceMeshParent.add(_threeGridMesh);
  update_threeGridMeshPose();

  // map neck rotations with face rotations:
  if (_spec.neckBoneName && _threeGridMesh.skeleton){
    _threeNeckBone = _threeGridMesh.skeleton.bones.find(function(threeBone){
      return (threeBone.name === _spec.neckBoneName);
    });
    
    if (_threeNeckBone){
      _threeNeckBone.matrixAutoUpdate = false;
      _threeGridMesh.onBeforeRender = function(){
        _threeNeckBone.updateMatrix();
        _threeNeckMat.makeRotationFromEuler(_threeNeckEuler);
        _threeNeckBone.matrix.multiply(_threeNeckMat);
      }
      _threeNeckEuler = new Euler();
      _threeNeckMat = new Matrix4();
    } else {
      console.log('WARNING in WebARRocksFaceDepthThreeHelper: neck bone not found.')
    }
  }
}


function update_threeGridMeshPose(){
  const s = _spec.faceScale;
  const t = _spec.faceOffset;
  const rx = _spec.faceRx;
  if (_threeGridMesh.skeleton){
    const matRx = new Matrix4().makeRotationX(rx);
    _threeGridMesh.bindMatrix.makeScale(s,s,s).setPosition(t[0], t[1], t[2]).multiply(matRx);
  } else {
    _threeGridMesh.scale.set(s,s,s);
    _threeGridMesh.position.fromArray(t);
    _threeGridMesh.rotateX(rx + Math.PI / 2.0);
  }
}


function create_threeGridMesh(res, threeRGBDTexture, maskTexturePath){
  const threeMaskTexture =  new TextureLoader().load( maskTexturePath );
  const threeGridGeom = new PlaneGeometry(1, 1, res, res);
  const threeMat = new ShaderMaterial({
    vertexShader: _RGBDVertexShaderSource,
    fragmentShader: _RGBDFragmentShaderSource,
    uniforms: {
      depthScale: { value: _spec.depthScale },
      res: {value: res},
      depthLightFallOffRange: { value: new Vector2().fromArray(_spec.depthLightFallOffRange) },
      depthLightFallOffIntensity: { value: _spec.depthLightFallOffIntensity },
      tRGBD: { value: threeRGBDTexture },
      tMask: { value: threeMaskTexture }
    },
    transparent: true
  });
  return new Mesh(threeGridGeom, threeMat);
}


const threeHelper = {
  init: function(spec){
    _spec = Object.assign({}, _defaultSpec, spec);
    init_cv();

    return new Promise(function(accept, reject){
      init_webArRocksDepth().then(function(){
        console.log('INFO in WebARRocksFaceDepthThreeHelper: WebAR.Rocks.faceDepth initialized');
        accept();
      }).catch(reject);
    }); //end returned promise

  },


  get_threeGridMesh(){
    return _threeGridMesh;
  },


  get_threeRGBDTexture(){
    return _threeRGBDTexture;
  }
};


export default threeHelper;

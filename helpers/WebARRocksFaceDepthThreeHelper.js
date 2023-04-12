const NNPath = '../../neuralNets/';
const _defaultSpec = {
  displayVideoRes: 512,
  
  // rendering:
  depthScale: 0.4,
  maskTexturePath: 'faceMask.png',
  depthLightFallOffRange: [-1, 0.5], // first value: depth when light falloff is max, second: stop light falloff
  depthLightFallOffIntensity: 0.8, // 1 -> full effect, 0 -> no effect
  depthAlphaFallOffRange: [-1, -0.5], // first value: depth when fully transparent, second: fully opaque

  // neural network models:
  //NNTrackPath: '../../../../../../neuralNets/raw/faceDepth/faceDepthTrack0_2022-08-14_tmp.json',
  //NNDepthPath: '../../../../../../neuralNets/raw/faceDepth/faceDepth0_2022-08-21_5_1_tmp.json',
  NNTrackPath: NNPath + 'NN_FACEDEPTH_TRACK_2.json',
  NNDepthPath: NNPath + 'NN_FACEDEPTH_DEPTH_7.json',

  // face insertion:
  threeAvatarModel: null,
  threeFaceMeshName: "robotFace",
  threeMeshesToHideIfDetected: [],
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
  InterleavedBuffer,
  InterleavedBufferAttribute,
  LinearFilter,
  Matrix4,
  Mesh,
  OneMinusSrcAlphaFactor,
  PlaneGeometry,
  ShaderMaterial,
  Skeleton,
  SkinnedMesh,
  TextureLoader,
  Vector2
  } from '../libs/three/v136/build/three.module.js';

let _spec = null;
let _cv = null;

let _RGBDBuf = null, _RGBDRes = -1;

let _isDisplayVideo = true;
let _isUpdateVideo = true;
let _timerHideVideo = null;

let _threeRGBDTexture = null, _threeGridMesh = null;
let _threeNeckBone = null, _threeNeckEuler = null, _threeNeckMat = null;
let _threeFaceMeshToReplace = null, _threeFaceMeshToHideIfDetected = [];


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
  uniform vec2 depthLightFallOffRange, depthAlphaFallOffRange;
  uniform float depthLightFallOffIntensity;

  void main() {
    float lightFallOff = smoothstep(depthLightFallOffRange.y, depthLightFallOffRange.x, vDepth);
    lightFallOff *= depthLightFallOffIntensity;
    float lightFallOffFactor = 1.0 - lightFallOff;

    float alphaFallOff = smoothstep(depthAlphaFallOffRange.x, depthAlphaFallOffRange.y, vDepth);
    float mask = texture2D(tMask, vUv).r * alphaFallOff;
    vec3 color = lightFallOffFactor * texture2D(tRGBD, vUv).rgb;
    
    gl_FragColor = vec4(color, mask);

    // DEBUG ZONE:
    //gl_FragColor = vec4(1., 0., 0., 1.); // all opaque red
    //gl_FragColor = vec4(1., 0., 0., 0.5); // half transparent red
    //gl_FragColor = vec4(1., 0., 0., mask);
    //gl_FragColor = vec4(1., 0., 0., lightFallOffFactor);
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
      callbackReady: function(err, specWebARRocksDepth){
        if (err){
          reject('AN ERROR HAPPENS. ERR =', err);
          return;
        }

        console.log('INFO: FACEDEPTH IS READY');
        _RGBDBuf = specWebARRocksDepth['RGBDBuf'];
        _RGBDRes = specWebARRocksDepth['RGBDRes'];
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
      set_originalThreeMeshesVisibility(true);
      _threeGridMesh.visible = false;
      if (_threeNeckBone){
        _threeNeckBone.matrixAutoUpdate = true;
      }
    }
    return;
  }
  if (_threeFaceMeshToReplace && !_threeGridMesh.visible){
    set_originalThreeMeshesVisibility(false);
    _threeGridMesh.visible = true;
    if (_threeNeckBone){
      _threeNeckBone.matrixAutoUpdate = false;
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


function create_threeRGBDTexture(threeGridMesh, RGBDBuf, RGBDRes){
  _threeRGBDTexture = new DataTexture(RGBDBuf, RGBDRes, RGBDRes);
  _threeRGBDTexture.magFilter = LinearFilter;
  _threeRGBDTexture.minFilter = LinearFilter;
  threeGridMesh.material.uniforms.tRGBD.value = _threeRGBDTexture;
}


function copy_skinGeometryAttribute(attrName, srcMesh, dstMesh){
  // extract info:
  const dstGeom = dstMesh.geometry;
  const dstCount = dstGeom.attributes.position.count;
  const srcAttr = srcMesh.geometry.attributes[attrName];
  const itemSize = srcAttr.itemSize;

  // get offset (when info start)
  const offset = (srcAttr.isInterleavedBufferAttribute) ? srcAttr.offset : 0;
  
  // forge attribute array:
  const elt0 = srcAttr.array.slice(offset, itemSize+offset);
  const dstAttrArr = new srcAttr.array.constructor(dstCount * itemSize);
  for (let i=0; i<dstCount; ++i){
    for (let j=0; j<itemSize; ++j){
      dstAttrArr[i*itemSize + j] = elt0[j];
    }
  }

  // affect new attribute:
  const dstAttr = new BufferAttribute(dstAttrArr, itemSize, false);

  dstGeom.setAttribute( attrName, dstAttr );
}


function get_meshByName(name){
  let r = null;
  _spec.threeAvatarModel.traverse(function(threeNode){
    if (threeNode.name === name){
      r = threeNode;
    }
  });
  return r;
}


function set_originalThreeMeshesVisibility(isVisible){
  _threeFaceMeshToHideIfDetected.forEach(function(threeMesh){
    threeMesh.visible = isVisible;
  });
}


function insert_face(){
  _threeFaceMeshToReplace = get_meshByName(_spec.threeFaceMeshName);
  
  if (!_threeFaceMeshToReplace){
    console.log('WARNING in WebARRocksFaceDepthThreeHelper - insert_face(): cannot find a mesh which name is ', _spec.threeFaceMeshName);
    return;
  }

  _threeFaceMeshToHideIfDetected = _spec.threeMeshesToHideIfDetected.map(function(name){
    return get_meshByName(name);
  }).filter(function(threeMesh){ // remove null elements (not found)
    return threeMesh;
  });
  _threeFaceMeshToHideIfDetected.push(_threeFaceMeshToReplace);


  const isSkinned = _threeFaceMeshToReplace.isSkinnedMesh;
  set_originalThreeMeshesVisibility(false);

  // bind _threeGridMesh with the skeleton if necessary:
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
  _threeGridMesh.name = "3D Face - generated by WebARRocksFaceDepthThreeHelper";
    
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

      console.log('INFO in WebARRocksFaceDepthThreeHelper: face inserted');
    } else {
      console.log('WARNING in WebARRocksFaceDepthThreeHelper: neck bone not found.');
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


function create_threeGridMesh(res, maskTexturePath){
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
      depthAlphaFallOffRange: { value: _spec.depthAlphaFallOffRange },
      tRGBD: { value: null },
      tMask: { value: threeMaskTexture }
    },
    transparent: true,
    blendDst: OneMinusSrcAlphaFactor
  });
  return new Mesh(threeGridGeom, threeMat);
}


const threeHelper = {
  init: function(spec){
    _spec = Object.assign({}, _defaultSpec, spec);
    init_cv();

    return new Promise(function(accept, reject){
      init_webArRocksDepth().then(function(){
        _threeGridMesh = create_threeGridMesh(_RGBDRes, _spec.maskTexturePath);
        create_threeRGBDTexture(_threeGridMesh, _RGBDBuf, _RGBDRes);

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
  },


  insert_face(){
    if (_spec.threeAvatarModel){
      threeHelper.precompute_matrices(_spec.threeAvatarModel);
      insert_face();
    }
  },


  precompute_matrices: function(threeModel){
    threeModel.traverse(function(threeNode){
      if (threeNode.updateMatrixWorld){
        threeNode.updateMatrixWorld();
      }
    });
  },


  disable_frustumCulling: function(threeModel){
    threeModel.traverse(function(threeNode){
      if (threeNode.frustumCulled){
        threeNode.frustumCulled = false;
      }
    });
  }
};


export default threeHelper;

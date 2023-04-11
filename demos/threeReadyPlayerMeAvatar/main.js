import * as THREE from '../../libs/three/v136/build/three.module.js';

import { OrbitControls } from '../../libs/three/v136/examples/jsm/controls/OrbitControls.js';

import { GLTFLoader } from '../../libs/three/v136/examples/jsm/loaders/GLTFLoader.js';
import { FBXLoader } from '../../libs/three/v136/examples/jsm/loaders/FBXLoader.js';


import WebARRocksFaceDepthThreeHelper from '../../helpers/WebARRocksFaceDepthThreeHelper.js';

let _threeCamera = null, _threeControls = null, _threeScene = null, _threeRenderer = null;
let _threeAnimationMixer = null, _threeClock = null, _threeModel = null, _threeAnimations = null;


// entry point:
function main(){
  init_three().then(init_webar).then(function(){
    bind_animation();
    
    render();
    WebARRocksFaceDepthThreeHelper.insert_face();
    set_avatarPose();
    
    hide_domLoading();
    animate();
  });
}


function hide_domLoading(){
  const domLoading = document.getElementById('loading');
  if (!domLoading) return;
  domLoading.style.opacity = 0;
  setTimeout(function(){
    domLoading.parentNode.removeChild(domLoading);
  }, 600);
}


function init_webar(){
  return WebARRocksFaceDepthThreeHelper.init({
    displayVideoRes: 512,
    depthScale: 0.4,

    maskTexturePath: 'assets/avatar/faceMask2.png',
    threeAvatarModel: _threeModel,
    threeFaceMeshName: "Wolf3D_Head",
    threeMeshesToHideIfDetected: ["Wolf3D_Teeth", "EyeLeft", "EyeRight", "Wolf3D_Hair", "Wolf3D_Glasses", "Wolf3D_Beard"],

    faceScale: 0.22,
    faceOffset: [0, 1.75, 0.088],//[0, 137, 22], // +Y -> up, +Z -> forward
    faceRx: -7 * Math.PI/180, // - -> look up
    
    neckBoneName: 'Neck'
  });
}


function init_three() {
  // create scene:
  _threeScene = new THREE.Scene();
  _threeScene.background = new THREE.Color( 0x050530 );
  
  // create renderer:
  _threeRenderer = new THREE.WebGLRenderer( { antialias: true } );
  _threeRenderer.setPixelRatio( window.devicePixelRatio );
  _threeRenderer.setSize( window.innerWidth, window.innerHeight );
  _threeRenderer.toneMapping = THREE.ACESFilmicToneMapping;
  _threeRenderer.outputEncoding = THREE.sRGBEncoding;
  _threeRenderer.shadowMap.enabled = true;
  _threeRenderer.shadowMap.type = THREE.VSMShadowMap;
  document.body.appendChild( _threeRenderer.domElement );

  // camera:
  const s = 0.006;
  _threeCamera = new THREE.PerspectiveCamera( 60, window.innerWidth / window.innerHeight, 10*s, 2000*s );
  _threeCamera.position.set( 200*s, 200*s, 800*s );

  // controls:
  _threeControls = new OrbitControls( _threeCamera, _threeRenderer.domElement );
  _threeControls.listenToKeyEvents( window ); // optional

  _threeControls.enableDamping = true; // an animation loop is required when either damping or auto-rotation are enabled
  _threeControls.dampingFactor = 0.05;
  _threeControls.screenSpacePanning = false;
  _threeControls.enablePan = false;

  _threeControls.minDistance = 250*s;
  _threeControls.maxDistance = 1000*s;
  _threeControls.maxPolarAngle = Math.PI / 2;//+ Math.PI/4;

  window.addEventListener( 'resize', onWindowResize );

  // lighting:
  const hemiLight = new THREE.HemisphereLight( 0xffffff, 0x000000, 0.5 );
  _threeScene.add(hemiLight);
  
  const spotLight = new THREE.SpotLight( 0xffffff );
  spotLight.angle = Math.PI / 6;
  spotLight.penumbra = 0.3;
  spotLight.position.set( 0, 3, 3 );
  spotLight.intensity = 1;
  spotLight.castShadow = true;
  spotLight.shadow.camera.near = 2;
  spotLight.shadow.camera.far = 10;
  spotLight.shadow.mapSize.width = 512;
  spotLight.shadow.mapSize.height = 512;
  spotLight.shadow.bias = - 0.001;
  //spotLight.shadow.radius = 4;
  _threeScene.add( spotLight );

  // ground floor:
  const groundGeom = new THREE.PlaneBufferGeometry(40, 40, 1, 1);
  const load_groundTexture = function(imageURL) {
    const groundTexture = new THREE.TextureLoader().load( 'assets/ground/' + imageURL );
    groundTexture.wrapS = THREE.RepeatWrapping;
    groundTexture.wrapT = THREE.RepeatWrapping;
    groundTexture.repeat.set( 30, 30 );
    return groundTexture;
  }
  const groundMat = new THREE.MeshStandardMaterial({
    map: load_groundTexture('hexagonal_concrete_paving_diff_512.jpg'),
    normalMap: load_groundTexture('hexagonal_concrete_paving_nor_gl_512.jpg'),
    //displacementMap: load_groundTexture('hexagonal_concrete_paving_disp_512.jpg'),
    roughnessMap: load_groundTexture('hexagonal_concrete_paving_rough_512.jpg'),
    color: 0x501505,
    roughness: 0.4,
    side: THREE.DoubleSide
  });
  const groundMesh = new THREE.Mesh(groundGeom, groundMat);
  groundMesh.rotateX(-Math.PI/2);
  groundMesh.position.setY(-1.19);
  groundMesh.castShadow = false;
  groundMesh.receiveShadow = true;
  _threeScene.add(groundMesh);

  // fog:
  _threeScene.fog = new THREE.Fog( 0x050530, 8, 12 );

  // animation:
  _threeClock = new THREE.Clock();

  return Promise.all([load_avatar(), load_animation()]);
}


function get_threeLoadingPromise(threeLoader, url, callback){
  return new Promise(function(accept, reject){
    const threeLoadingManager = new THREE.LoadingManager();
    threeLoadingManager.onLoad = accept;
    threeLoadingManager.onError = reject;

    const loader = new threeLoader(threeLoadingManager);
    loader.load(url, callback);
  }); //end returned promise
}


function enable_shadow(threeModel, isCastShadow, isReceiveShadow){
  threeModel.traverse(function(threeNode){
    if (threeNode.isMesh || threeNode.isSkinnedMesh){
      threeNode.castShadow = isCastShadow;
      threeNode.receiveShadow = isReceiveShadow;
    }
  });
}


function load_avatar() {
  return get_threeLoadingPromise(GLTFLoader, 'assets/avatar/rpmAvatar2.glb', function(gltf){
      // extract the model, add it to the scene and set its pose:
      _threeModel = gltf.scene;
      _threeScene.add(_threeModel);

      enable_shadow(_threeModel, true, true);
      
      // disable frustum culling, there are weird bugs with the animation:
      WebARRocksFaceDepthThreeHelper.disable_frustumCulling(_threeModel);
    });
}


function set_avatarPose(){
  _threeModel.position.setY(-1.2);
}


function convert_animationMixamoToReadyPlayerMe(threeAnimation){
  threeAnimation.tracks.forEach(convert_animationTrackMixamoToReadyPlayerMe);
}


function convert_animationTrackMixamoToReadyPlayerMe(threeAnimationTrack){
  threeAnimationTrack.name = threeAnimationTrack.name.replace('mixamorig', '');
  const trackType = threeAnimationTrack.name.split('.').pop();
  if (trackType === 'position'){
    const n = threeAnimationTrack.values.length;
    for (let i=0; i<n; ++i){ // FBX export issue: percentage taken as a factor
      threeAnimationTrack.values[i] *= 0.01;
    }
  }
}


function load_animation(){
  return get_threeLoadingPromise(FBXLoader, 'assets/mixamo/GangnamStyle.fbx', function(fbx){
      _threeAnimations = fbx.animations;
      _threeAnimations.forEach(convert_animationMixamoToReadyPlayerMe);
    });
}


function bind_animation(){
  if (_threeAnimations){
    _threeAnimationMixer = new THREE.AnimationMixer(_threeModel);
    
    const animationClip = _threeAnimations[0];
    const animationAction = _threeAnimationMixer.clipAction( animationClip );
    animationAction.loop = THREE.LoopRepeat;
    animationAction.play();
  }
  return Promise.resolve();
}


function onWindowResize() {
  _threeCamera.aspect = window.innerWidth / window.innerHeight;
  _threeCamera.updateProjectionMatrix();
  _threeRenderer.setSize( window.innerWidth, window.innerHeight );
}


function render() {
  if (_threeAnimationMixer !== null){
    _threeAnimationMixer.update(_threeClock.getDelta() * 1.0);
  }

  _threeRenderer.render( _threeScene, _threeCamera );
}


function animate() {
  _threeControls.update();
  
  render();

  requestAnimationFrame( animate );
}


window.addEventListener('load', main);
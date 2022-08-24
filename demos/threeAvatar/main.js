import * as THREE from '../../libs/three/v136/build/three.module.js';

import { OrbitControls } from '../../libs/three/v136/examples/jsm/controls/OrbitControls.js';

import { GLTFLoader } from '../../libs/three/v136/examples/jsm/loaders/GLTFLoader.js';

import WebARRocksFaceDepthThreeHelper from '../../helpers/WebARRocksFaceDepthThreeHelper.js';

let _threeCamera = null, _threeControls = null, _threeScene = null, _threeRenderer = null;
let _threeAnimationMixer = null, _threeClock = null, _threeModel = null;


// entry point:
function main(){
  init_three().then(init_webar).then(function(){
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

    maskTexturePath: 'faceMask.png',
    threeAvatarModel: _threeModel,
    threeFaceMeshName: "robotFace",

    faceScale: 60.0,
    faceOffset: [0, 87, 22], // +Y -> up, +Z -> forward
    faceRx: -10 * Math.PI/180, // - -> look up

    neckBoneName: 'headx_0117',
    onFaceMeshReady: function(threeFaceMesh){
      console.log('init_webar(): done successfully');
    }
  });
}


function init_three() {
  // create scene:
  _threeScene = new THREE.Scene();
  _threeScene.background = new THREE.Color( 0x333333 );
  
  // create renderer:
  _threeRenderer = new THREE.WebGLRenderer( { antialias: true } );
  _threeRenderer.setPixelRatio( window.devicePixelRatio );
  _threeRenderer.setSize( window.innerWidth, window.innerHeight );
  _threeRenderer.toneMapping = THREE.ACESFilmicToneMapping;
  _threeRenderer.outputEncoding = THREE.sRGBEncoding;

  document.body.appendChild( _threeRenderer.domElement );

  // camera:
  _threeCamera = new THREE.PerspectiveCamera( 60, window.innerWidth / window.innerHeight, 10, 2000 );
  _threeCamera.position.set( 100, 100, 400 );

  // controls:
  _threeControls = new OrbitControls( _threeCamera, _threeRenderer.domElement );
  _threeControls.listenToKeyEvents( window ); // optional

  _threeControls.enableDamping = true; // an animation loop is required when either damping or auto-rotation are enabled
  _threeControls.dampingFactor = 0.05;
  _threeControls.screenSpacePanning = false;
  _threeControls.enablePan = false;

  _threeControls.minDistance = 250;
  _threeControls.maxDistance = 1000;
  _threeControls.maxPolarAngle = Math.PI / 2 + Math.PI/4;

  window.addEventListener( 'resize', onWindowResize );

  // lighting:
  const hemiLight = new THREE.HemisphereLight( 0xffffff, 0x000000, 0.5 );
  _threeScene.add(hemiLight);
  
  const pointLight = new THREE.PointLight( 0xffffff, 0.7 );
  pointLight.position.set(200, 200, 200);
  _threeScene.add(pointLight);

  // world:
  return new Promise(function(accept, reject){
    const threeLoadingManager = new THREE.LoadingManager();
    threeLoadingManager.onLoad = accept;
    const loader = new GLTFLoader(threeLoadingManager);
    loader.load('goofyrobotVisorPlan.glb', function(gltf){
      // extract the model, add it to the scene and set its pose:
      _threeModel = gltf.scene;
      _threeModel.scale.multiplyScalar(250.0);
      _threeModel.position.setY(-170);
      _threeScene.add(_threeModel);

      // disable frustum culling, there are weird bugs with the animation:
      _threeModel.traverse(function(threeNode){
        if (threeNode.frustumCulled){
          threeNode.frustumCulled = false;
        }
      });

      // animate the model:
      const animationClip = gltf.animations[0];
      _threeAnimationMixer = new THREE.AnimationMixer(_threeModel);
      _threeClock = new THREE.Clock();
      const animationAction = _threeAnimationMixer.clipAction( animationClip );
      animationAction.loop = THREE.LoopPingPong;
      animationAction.play();
    });
  });
}


function onWindowResize() {
  _threeCamera.aspect = window.innerWidth / window.innerHeight;
  _threeCamera.updateProjectionMatrix();
  _threeRenderer.setSize( window.innerWidth, window.innerHeight );
}


function animate() {
  _threeControls.update();
  
  if (_threeAnimationMixer !== null){
    _threeAnimationMixer.update(_threeClock.getDelta() * 1.0);
  }

  _threeRenderer.render( _threeScene, _threeCamera );
  requestAnimationFrame( animate );
}


window.addEventListener('load', main);
import { CursorTargettingSystem } from "./cursor-targetting-system";
import { PositionAtBorderSystem } from "../components/position-at-border";
import { BoneVisibilitySystem } from "../components/bone-visibility";
import { AnimationMixerSystem } from "../components/animation-mixer";
import { UVScrollSystem } from "../components/uv-scroll";
import { CursorTogglingSystem } from "./cursor-toggling-system";
import { PhysicsSystem } from "./physics-system";
import { ConstraintsSystem } from "./constraints-system";
import { TwoPointStretchingSystem } from "./two-point-stretching-system";
import { SingleActionButtonSystem, HoldableButtonSystem, HoverButtonSystem } from "./button-systems";
import { DrawingMenuSystem } from "./drawing-menu-system";
import { HoverMenuSystem } from "./hover-menu-system";
import { SuperSpawnerSystem } from "./super-spawner-system";
import { HapticFeedbackSystem } from "./haptic-feedback-system";
import { SoundEffectsSystem } from "./sound-effects-system";
import { BatchManagerSystem } from "./render-manager-system";
import { ScenePreviewCameraSystem } from "./scene-preview-camera-system";
import { InteractionSfxSystem } from "./interaction-sfx-system";
import { SpriteSystem } from "./sprites";
import { CameraSystem } from "./camera-system";
import { WaypointSystem } from "./waypoint-system";
import { CharacterControllerSystem } from "./character-controller-system";
import { waitForDOMContentLoaded } from "../utils/async-utils";
import { CursorPoseTrackingSystem } from "./cursor-pose-tracking";
import { ScaleInScreenSpaceSystem } from "./scale-in-screen-space";
import { MenuAnimationSystem } from "./menu-animation-system";
import { AudioSettingsSystem } from "./audio-settings-system";
import { AudioSystem } from "./audio-system";
import { ShadowSystem } from "./shadow-system";
import { MediaFramesSystem } from "./media-frames";
import { InspectYourselfSystem } from "./inspect-yourself-system";
import { EmojiSystem } from "./emoji-system";

AFRAME.registerSystem("hubs-systems", {
  init() {
    waitForDOMContentLoaded().then(() => {
      this.DOMContentDidLoad = true;
    });
    this.cursorTogglingSystem = new CursorTogglingSystem();
    this.interactionSfxSystem = new InteractionSfxSystem();
    this.superSpawnerSystem = new SuperSpawnerSystem();
    this.cursorTargettingSystem = new CursorTargettingSystem(this.el);
    this.positionAtBorderSystem = new PositionAtBorderSystem();
    this.physicsSystem = new PhysicsSystem(this.el.object3D);
    this.constraintsSystem = new ConstraintsSystem(this.physicsSystem);
    this.twoPointStretchingSystem = new TwoPointStretchingSystem();
    this.singleActionButtonSystem = new SingleActionButtonSystem();
    this.holdableButtonSystem = new HoldableButtonSystem();
    this.hoverButtonSystem = new HoverButtonSystem();
    this.hoverMenuSystem = new HoverMenuSystem();
    this.hapticFeedbackSystem = new HapticFeedbackSystem();
    this.audioSystem = new AudioSystem(this.el);
    this.soundEffectsSystem = new SoundEffectsSystem(this.el);
    this.scenePreviewCameraSystem = new ScenePreviewCameraSystem();
    this.spriteSystem = new SpriteSystem(this.el);
    this.batchManagerSystem = new BatchManagerSystem(this.el.object3D, this.el.renderer);
    this.cameraSystem = new CameraSystem(this.el);
    this.drawingMenuSystem = new DrawingMenuSystem(this.el);
    this.characterController = new CharacterControllerSystem(this.el);
    this.waypointSystem = new WaypointSystem(this.el, this.characterController);
    this.cursorPoseTrackingSystem = new CursorPoseTrackingSystem();
    this.scaleInScreenSpaceSystem = new ScaleInScreenSpaceSystem();
    this.menuAnimationSystem = new MenuAnimationSystem();
    this.audioSettingsSystem = new AudioSettingsSystem(this.el);
    this.animationMixerSystem = new AnimationMixerSystem();
    this.boneVisibilitySystem = new BoneVisibilitySystem();
    this.uvScrollSystem = new UVScrollSystem();
    this.shadowSystem = new ShadowSystem(this.el);
    this.mediaFramesSystem = new MediaFramesSystem(this.physicsSystem, this.el.systems.interaction);
    this.inspectYourselfSystem = new InspectYourselfSystem();
    this.emojiSystem = new EmojiSystem(this.el);
  },

  tick(t, dt) {
    if (!this.DOMContentDidLoad) return;
    const systems = AFRAME.scenes[0].systems;
    systems.userinput.tick2();
    systems.interaction.tick2();

    // We run this earlier in the frame so things have a chance to override properties run by animations
    this.animationMixerSystem.tick(dt);

    this.characterController.tick(t, dt);
    this.cursorTogglingSystem.tick(systems.interaction, systems.userinput, this.el);
    this.interactionSfxSystem.tick(systems.interaction, systems.userinput, this.soundEffectsSystem);
    this.superSpawnerSystem.tick();
    this.emojiSystem.tick(t, systems.userinput);
    this.cursorPoseTrackingSystem.tick();
    this.cursorTargettingSystem.tick(t);
    this.hoverMenuSystem.tick();
    this.positionAtBorderSystem.tick();
    this.scaleInScreenSpaceSystem.tick();
    this.constraintsSystem.tick();
    this.twoPointStretchingSystem.tick();
    this.singleActionButtonSystem.tick();
    this.holdableButtonSystem.tick();
    this.hoverButtonSystem.tick();
    this.drawingMenuSystem.tick();
    this.hapticFeedbackSystem.tick(
      this.twoPointStretchingSystem,
      this.singleActionButtonSystem.didInteractLeftThisFrame,
      this.singleActionButtonSystem.didInteractRightThisFrame
    );
    this.soundEffectsSystem.tick();
    this.scenePreviewCameraSystem.tick();
    this.physicsSystem.tick(dt);
    this.batchManagerSystem.tick(t);
    this.inspectYourselfSystem.tick(this.el, systems.userinput, this.cameraSystem);
    this.cameraSystem.tick(this.el, dt);
    this.waypointSystem.tick(t, dt);
    this.menuAnimationSystem.tick(t);
    this.spriteSystem.tick(t, dt);
    this.uvScrollSystem.tick(dt);
    this.shadowSystem.tick();
    this.mediaFramesSystem.tick();

    // We run this late in the frame so that its the last thing to have an opinion about the scale of an object
    this.boneVisibilitySystem.tick();
  },

  remove() {
    this.cursorTargettingSystem.remove();
  }
});

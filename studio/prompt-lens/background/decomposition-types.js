/**
 * decomposition 类型（B0）：observation 的生成导向导出形态
 * @module decomposition-types
 */

/** @typedef {'portrait'|'product'|'poster'|'environment'|'ui'|'auto'} DecompositionProfile */

/**
 * @typedef {Object} DecompositionMeta
 * @property {string} [style]
 * @property {string} [medium]
 * @property {'photoreal'|'semi-real'|'stylized'} [realism_target]
 * @property {string} [aspect_ratio]
 * @property {'portrait'|'landscape'} [orientation]
 */

/**
 * @typedef {Object} DecompositionFrame
 * @property {string} [crop]
 * @property {string} [subject_position]
 * @property {string} [negative_space]
 * @property {string[]} [depth_order]
 */

/**
 * @typedef {Object} SubjectIdentity
 * @property {string} [age_range]
 * @property {'male'|'female'} [gender]
 * @property {string} [build]
 * @property {string[]} [visible_features]
 * @property {string[]} [distinctive_traits]
 */

/**
 * @typedef {Object} SubjectHead
 * @property {string} [orientation]
 * @property {string} [gaze]
 * @property {string} [expression]
 * @property {string} [mouth]
 * @property {{ description?: string, anchor_color?: string, highlight_color?: string }} [hair]
 */

/**
 * @typedef {Object} SubjectPose
 * @property {string} [torso]
 * @property {string} [left_arm]
 * @property {string} [right_arm]
 * @property {string} [left_hand]
 * @property {string} [right_hand]
 */

/**
 * @typedef {Object} SubjectWardrobe
 * @property {string} [description]
 * @property {string} [base_color]
 * @property {string} [fabric_type]
 */

/**
 * @typedef {Object} SubjectDecomposition
 * @property {string} [id]
 * @property {SubjectIdentity} [identity]
 * @property {SubjectHead} [head]
 * @property {SubjectPose} [pose]
 * @property {SubjectWardrobe} [wardrobe]
 */

/**
 * @typedef {Object} DecompositionLightingKey
 * @property {string} [direction]
 * @property {'soft'|'hard'} [quality]
 * @property {string} [color]
 * @property {'low'|'medium'|'high'} [intensity]
 */

/**
 * @typedef {Object} DecompositionLighting
 * @property {DecompositionLightingKey} [key_light]
 * @property {{ direction?: string, intensity?: string }} [fill_light]
 * @property {{ presence?: 'none'|'subtle'|'strong', color?: string, coverage?: string }} [rim_light]
 * @property {{ description?: string, emissive_source?: boolean }} [environment_reflection]
 * @property {'low'|'medium'|'high'} [contrast]
 * @property {string} [dynamic_range]
 * @property {string[]} [avoid]
 */

/**
 * @typedef {Object} DecompositionCamera
 * @property {string} [view]
 * @property {string} [lens_feel]
 * @property {string} [perspective]
 * @property {'shallow'|'moderate'|'deep'} [depth_of_field]
 * @property {string} [motion_capture]
 */

/**
 * @typedef {Object} DecompositionComposition
 * @property {string} [visual_focus]
 * @property {string} [leading_direction]
 * @property {'small'|'medium'|'dominant'} [subject_scale]
 * @property {string} [balance]
 * @property {string} [empty_space]
 */

/**
 * @typedef {Object} DecompositionBackground
 * @property {string} [description]
 * @property {string} [anchor_color]
 * @property {string} [texture]
 * @property {'minimal'|'moderate'|'dense'} [density]
 */

/**
 * @typedef {Object} DecompositionSkinMaterial
 * @property {string} [surface]
 * @property {string[]} [micro_detail]
 * @property {string} [specular]
 * @property {string} [finish]
 * @property {string[]} [avoid]
 */

/**
 * @typedef {Object} DecompositionFabricMaterial
 * @property {string} [type]
 * @property {string} [description]
 * @property {string[]} [avoid]
 */

/**
 * @typedef {Object} DecompositionEffectMaterial
 * @property {string} [type]
 * @property {string} [description]
 */

/**
 * @typedef {Object} DecompositionMaterials
 * @property {DecompositionSkinMaterial} [skin]
 * @property {DecompositionFabricMaterial} [fabric]
 * @property {DecompositionEffectMaterial} [effect_material]
 */

/**
 * @typedef {Object} DecompositionPrimaryEffect
 * @property {string} [type]
 * @property {string[]} [locations]
 * @property {string[]} [shape_language]
 * @property {string} [motion]
 * @property {'low'|'medium'|'high'} [density]
 */

/**
 * @typedef {Object} DecompositionEffects
 * @property {DecompositionPrimaryEffect} [primary_effect]
 * @property {DecompositionPrimaryEffect[]} [secondary_effects]
 */

/**
 * @typedef {Object} ColorAnchor
 * @property {string} [anchor]
 * @property {string} [highlight]
 * @property {string} [shadow]
 * @property {string} [accent]
 */

/**
 * @typedef {Object} DecompositionColorSystem
 * @property {ColorAnchor} [background]
 * @property {ColorAnchor} [skin]
 * @property {ColorAnchor} [hero]
 * @property {ColorAnchor} [accent]
 * @property {ColorAnchor} [effect]
 */

/**
 * 生成约束：仅规则表注入，不来自 VLM
 * @typedef {Object} DecompositionConstraintBlock
 * @property {string[]} [desired]
 * @property {string[]} [avoid]
 */

/**
 * @typedef {Object} Decomposition
 * @property {DecompositionProfile} [profile]
 * @property {DecompositionMeta} [meta]
 * @property {DecompositionFrame} [frame]
 * @property {DecompositionBackground} [background]
 * @property {SubjectDecomposition[]} [subjects]
 * @property {DecompositionMaterials} [materials]
 * @property {DecompositionEffects} [effects]
 * @property {DecompositionColorSystem} [color_system]
 * @property {DecompositionLighting} [lighting]
 * @property {DecompositionComposition} [composition]
 * @property {DecompositionCamera} [camera]
 * @property {DecompositionConstraintBlock} [anatomy_constraints]
 * @property {DecompositionConstraintBlock} [rendering_constraints]
 * @property {{ text?: string, role?: string }[]} [typography]
 */

/**
 * @typedef {Object} DecomposeContext
 * @property {{ ratioLine?: string, w?: number, h?: number }} [ratioMeta]
 * @property {number} [width]
 * @property {number} [height]
 * @property {Record<string, string>} [paletteGround] HEX 仅来自 groundPack 采样
 * @property {DecompositionProfile} [profile]
 * @property {boolean} [useCelebrityName]
 * @property {boolean} [includeAnimeCharacter]
 */

export {};

export const ACTION_NAMES: string[][] = [
  [
    'Walk',
    'Idle',
    'Die1',
    'Die2',
    'Attack1',
    'Attack2',
    'Attack3',
    'AttackBow',
    'AttackCrossBow',
    'AttackThrow',
    'GetHit',
    'Pillage',
    'Stomp',
    'Cast2',
    'Cast3',
    'BlockRight',
    'BlockLeft',
    'Idle',
    'Fidget',
    'Fly',
    'TakeOff',
    'GetHitInAir'
  ],
  ['Walk', 'Run', 'Idle', 'Idle', 'Fidget', 'Attack1', 'Attack2', 'GetHit', 'Die1'],
  ['Walk', 'Run', 'Idle', 'Eat', 'Alert', 'Attack1', 'Attack2', 'GetHit', 'Die1', 'Idle', 'Fidget', 'LieDown', 'Die2'],
  [
    'Walk_01',
    'WalkStaff_01',
    'Run_01',
    'RunStaff_01',
    'Idle_01',
    'Idle_01',
    'Fidget_Yawn_Stretch_01',
    'CombatIdle1H_01',
    'CombatIdle1H_01',
    'AttackSlash1H_01',
    'AttackPierce1H_01',
    'AttackBash1H_01',
    'AttackBash2H_01',
    'AttackSlash2H_01',
    'AttackPierce2H_01',
    'CombatAdvance_1H_01',
    'Spell1',
    'Spell2',
    'AttackBow_01',
    'AttackCrossbow_01',
    'GetHit_Fr_Hi_01',
    'Die_Hard_Fwd_01',
    'Die_Hard_Back_01',
    'Horse_Walk_01',
    'Horse_Run_01',
    'Horse_Idle_01',
    'Horse_Attack1H_SlashRight_01',
    'Horse_AttackBow_01',
    'Horse_AttackCrossbow_01',
    'Horse_Attack2H_SlashRight_01',
    'Block_Shield_Hard_01',
    'Punch_Punch_Jab_01',
    'Bow_Lesser_01',
    'Salute_Armed1h_01',
    'Ingest_Eat_01'
  ]
];

export const DIRECTION_NAMES: string[] = [
  'North',
  'North-East',
  'East',
  'South-East',
  'South',
  'South-West',
  'West',
  'North-West'
];

export function actionName(type: number | null | undefined, action: number): string | null {
  if (type === null || type === undefined) {
    return null;
  }
  const index = Math.min(Math.max(type, 0), ACTION_NAMES.length - 1);
  return ACTION_NAMES[index]?.[action] ?? null;
}

export function directionName(direction: number): string | null {
  return DIRECTION_NAMES[direction] ?? null;
}

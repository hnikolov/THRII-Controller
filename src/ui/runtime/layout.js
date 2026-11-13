// Static runtime layout: which device unit and parameter each control reads.
// Parameter names are the device names used in the shadow store (the captured device model).
// Dropdown values are device symbol names; labels are UI names (proposed, to be reviewed on the device).
// Amp families in LED order: a tap on the amp LED steps Classic -> Boutique -> Modern.
// A model's position in its family is kept across a step (the same role in the next family).
// Values are device symbol names (the write resolves their ids); labels are the names shown in the UI (proposed).
export const AMP_FAMILY_ORDER = ['classic', 'boutique', 'modern'];

export const AMP_FAMILIES = {
  classic: {
    title: 'Classic',
    led: 'red',
    models: [
      { value: 'THR10C_Deluxe', label: 'Deluxe' },
      { value: 'THR10C_DC30', label: 'DC30' },
      { value: 'THR10_Lead', label: 'Lead' },
      { value: 'THR10_Modern', label: 'Modern' },
      { value: 'THR10X_Brown1', label: 'Brown 1' },
      { value: 'THR10_Bass_Eden_Marcus', label: 'Eden Bass' },
      { value: 'THR10_Aco_Condenser1', label: 'Condenser' },
      { value: 'THR10_Flat', label: 'Flat' }
    ]
  },
  boutique: {
    title: 'Boutique',
    led: 'blue',
    models: [
      { value: 'THR10C_BJunior2', label: 'Junior 2' },
      { value: 'THR10C_Mini', label: 'Mini' },
      { value: 'THR30_Blondie', label: 'Blondie' },
      { value: 'THR30_FLead', label: 'F Lead' },
      { value: 'THR10X_South', label: 'South' },
      { value: 'THR10_Bass_Mesa', label: 'Mesa Bass' },
      { value: 'THR10_Aco_Tube1', label: 'Tube' },
      { value: 'THR10_Flat_B', label: 'Flat B' }
    ]
  },
  modern: {
    title: 'Modern',
    led: 'green',
    models: [
      { value: 'THR30_Carmen', label: 'Carmen' },
      { value: 'THR30_SR101', label: 'SR101' },
      { value: 'THR10_Brit', label: 'Brit' },
      { value: 'THR10X_Brown2', label: 'Brown 2' },
      { value: 'THR30_Stealth', label: 'Stealth' },
      { value: 'THR30_JKBass2', label: 'JK Bass 2' },
      { value: 'THR10_Aco_Dynamic1', label: 'Dynamic' },
      { value: 'THR10_Flat_V', label: 'Flat V' }
    ]
  }
};

// Knob sets shown before any device data (the default look). A device type replaces them by name.
const DEFAULT_KNOBS = {
  effect: [
    { label: 'SPEED', param: ['Freq', 'Speed'] },
    { label: 'DEPTH', param: 'Depth' },
    { label: 'PRE DELAY', param: ['Pre', 'Pre Delay'] },
    { label: 'FEEDBACK', param: 'Feedback' },
    { label: 'MIX', param: 'FX2MixState' }
  ],
  echo: [
    { label: 'TIME', param: 'Time' },
    { label: 'FEEDBACK', param: 'Feedback' },
    { label: 'BASS', param: 'Bass' },
    { label: 'TREBLE', param: 'Treble' },
    { label: 'MIX', param: 'FX3MixState' }
  ],
  reverb: [
    { label: 'DECAY', param: 'Decay' },
    { label: 'PRE DELAY', param: 'Pre Delay' },
    { label: 'TONE', param: 'Tone' },
    { label: 'MIX', param: 'FX4WetSendState' }
  ]
};

export const RUNTIME_LAYOUT = {
  presetMenu: {
    label: 'PRESETS',
    // value is the action the shell runs (intents.presetAction). Disabled items are not implemented yet.
    items: [
      { value: 'export', label: 'Export' },
      { value: 'import', label: 'Import' },
      { value: 'importAi', label: 'Import AI', disabled: true },
      { value: 'importFactory', label: 'Import Factory', disabled: true },
      ...[1, 2, 3, 4, 5].map(slot => ({ value: `save:${slot}`, label: `Save to THR slot ${slot}` })),
      { value: 'backup', label: 'Backup THR' },
      { value: 'restore', label: 'Restore THR' }
    ]
  },
  // Amp dropdown: one column per family.
  ampGroups: AMP_FAMILY_ORDER.map(key => ({ key, title: AMP_FAMILIES[key].title, items: AMP_FAMILIES[key].models })),
  // Index = value of the device enum SpkSimType (GuitarProc).
  cabinets: [
    'British 4x12', 'American 4x12', 'Brown 4x12', 'Vintage 4x12', 'Fuel 4x12', 'Juicy 4x12', 'Mods 4x12',
    'American 2x12', 'British 2x12', 'British Blues', 'Boutique 2x12', 'Yamaha 2x12', 'California 1x12',
    'American 1x12', 'American 4x10', 'Boutique 1x12', 'Bypass'
  ],
  amp: {
    unit: 'Amp',
    cabinetUnit: 'GuitarProc',
    cabinetParam: 'SpkSimType',
    knobs: [
      { label: 'GAIN', param: 'Drive' },
      { label: 'MASTER', param: 'Master' },
      { label: 'BASS', param: 'Bass' },
      { label: 'MID', param: 'Mid' },
      { label: 'TREBLE', param: 'Treble' }
    ]
  },
  rows: [
    {
      type: 'dual',
      modules: [
        {
          key: 'comp',
          mode: 'COMP',
          compact: true,
          unit: 'FX1',
          enable: 'FX1EnableState',
          knobs: [{ label: 'SUSTAIN', param: 'Sustain' }, { label: 'LEVEL', param: 'Level' }]
        },
        {
          key: 'gate',
          mode: 'NOISE GATE',
          compact: true,
          unit: 'GuitarProc',
          enable: 'GateEnableState',
          knobs: [{ label: 'THRESHOLD', param: 'Thresh', range: [-96, 0] }, { label: 'DECAY', param: 'Decay' }]
        }
      ]
    },
    {
      type: 'single',
      module: {
        key: 'effect',
        title: 'EFFECT',
        unit: 'FX2',
        enable: 'FX2EnableState',
        // Option value is the device symbol name (the write resolves its id); label is the name shown in the UI.
        unitOptions: [
          { value: 'StereoSquareChorus', label: 'Chorus' },
          { value: 'Phaser', label: 'Phaser' },
          { value: 'L6Flanger', label: 'Flanger' },
          { value: 'BiasTremolo', label: 'Tremolo' }
        ],
        defaultKnobs: DEFAULT_KNOBS.effect,
        // Knob sets per type (legacy schema). A type's knobs are right-aligned; the other slots are hidden.
        // default: the value (0..100) the amp uses when this type is selected; the app writes it, the amp does not apply it by itself.
        // unit: the device unit that holds the parameter when it is not the module's own (the mixes live on GuitarProc).
        knobsByType: {
          chorus: [
            { label: 'SPEED', param: 'Freq', default: 12 },
            { label: 'DEPTH', param: 'Depth', default: 23 },
            { label: 'PRE DELAY', param: ['Pre', 'Pre Delay'], default: 50 },
            { label: 'FEEDBACK', param: 'Feedback', default: 12 },
            { label: 'MIX', param: 'FX2MixState', unit: 'GuitarProc', default: 45 }
          ],
          flanger: [
            { label: 'SPEED', param: 'Freq', default: 4 },
            { label: 'DEPTH', param: 'Depth', default: 44 },
            { label: 'MIX', param: 'FX2MixState', unit: 'GuitarProc', default: 26 }
          ],
          phaser: [
            { label: 'SPEED', param: 'Speed', default: 1 },
            { label: 'FEEDBACK', param: 'Feedback', default: 43 },
            { label: 'MIX', param: 'FX2MixState', unit: 'GuitarProc', default: 33 }
          ],
          tremolo: [
            { label: 'SPEED', param: 'Speed', default: 34 },
            { label: 'DEPTH', param: 'Depth', default: 71 },
            { label: 'MIX', param: 'FX2MixState', unit: 'GuitarProc', default: 41 }
          ]
        }
      }
    },
    {
      type: 'single',
      module: {
        key: 'echo',
        title: 'ECHO',
        badge: 'TAP',
        // Tap tempo sets the echo time: the amp reports its own TAP button as FX3.Time = interval / 1000 ms, the same for
        // both echo types (captures tap_tempo_*.txt: 60 BPM gives 1.0, 120 BPM 0.5, 240 BPM 0.25).
        tap: { param: 'Time', fullScaleMs: 1000 },
        unit: 'FX3',
        enable: 'FX3EnableState',
        unitOptions: [
          { value: 'TapeEcho', label: 'Tape Echo' },
          { value: 'L6DigitalDelay', label: 'Digital Delay' }
        ],
        defaultKnobs: DEFAULT_KNOBS.echo,
        knobsByType: {
          tapeecho: [
            { label: 'TIME', param: 'Time', default: 41 },
            { label: 'FEEDBACK', param: 'Feedback', default: 50 },
            { label: 'BASS', param: 'Bass', default: 43 },
            { label: 'TREBLE', param: 'Treble', default: 55 },
            { label: 'MIX', param: 'FX3MixState', unit: 'GuitarProc', default: 26 }
          ],
          digitaldelay: [
            { label: 'TIME', param: 'Time', default: 39 },
            { label: 'FEEDBACK', param: 'Feedback', default: 38 },
            { label: 'BASS', param: 'Bass', default: 26 },
            { label: 'TREBLE', param: 'Treble', default: 37 },
            { label: 'MIX', param: 'FX3MixState', unit: 'GuitarProc', default: 36 }
          ]
        }
      }
    },
    {
      type: 'single',
      module: {
        key: 'reverb',
        title: 'REVERB',
        unit: 'FX4',
        enable: 'FX4EnableState',
        unitOptions: [
          { value: 'StandardSpring', label: 'Spring' },
          { value: 'LargePlate1', label: 'Plate' },
          { value: 'SmallRoom1', label: 'Room' },
          { value: 'ReallyLargeHall', label: 'Hall' }
        ],
        defaultKnobs: DEFAULT_KNOBS.reverb,
        knobsByType: {
          spring: [
            { label: 'REVERB', param: 'Time', default: 25 },
            { label: 'TONE', param: 'Tone', default: 50 },
            { label: 'MIX', param: 'FX4WetSendState', unit: 'GuitarProc', default: 19 }
          ],
          plate: [
            { label: 'DECAY', param: 'Decay', default: 24 },
            { label: 'PRE DELAY', param: 'Pre Delay', default: 31 },
            { label: 'TONE', param: 'Tone', default: 54 },
            { label: 'MIX', param: 'FX4WetSendState', unit: 'GuitarProc', default: 20 }
          ],
          room: [
            { label: 'DECAY', param: 'Decay', default: 13 },
            { label: 'PRE DELAY', param: 'Pre Delay', default: 6 },
            { label: 'TONE', param: 'Tone', default: 59 },
            { label: 'MIX', param: 'FX4WetSendState', unit: 'GuitarProc', default: 10 }
          ],
          hall: [
            { label: 'DECAY', param: 'Decay', default: 18 },
            { label: 'PRE DELAY', param: 'Pre Delay', default: 10 },
            { label: 'TONE', param: 'Tone', default: 62 },
            { label: 'MIX', param: 'FX4WetSendState', unit: 'GuitarProc', default: 45 }
          ]
        }
      }
    }
  ]
};

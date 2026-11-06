export const thrActivateSequenceHex = [
  'f0 7e 7f 06 01 f7',
  'f0 00 01 0c 24 01 4d 00 00 00 00 07 00 01 00 00 00 00 00 00 00 00 00 00 00 00 00 00 f7',
  'f0 00 01 0c 24 01 4d 00 01 00 00 07 00 04 00 00 00 04 00 00 00 00 00 00 00 00 00 00 f7',
  'f0 00 01 0c 24 01 4d 00 02 00 00 03 28 72 4d 54 5d 00 00 00 f7'
];

export const thrKeys = {
  unit: {
    amp: 0x0000010c,
    fx1: 0x00000109,
    fx2: 0x0000010e,
    fx3: 0x00000111,
    fx4: 0x00000114,
    guitarProc: 0x0000013c,
    global: 0xffffffff
  },
  parameter: {
    spkSimType: 0x00000107,
    gateEnable: 0x00000104,
    fx1Enable: 0x00000130,
    fx2Enable: 0x0000012f,
    fx3Enable: 0x0000012e,
    fx4Enable: 0x00000132
  },
  enumValue: {
    effect: {
      chorus: 230,
      flanger: 226,
      phaser: 208,
      tremolo: 220
    },
    echo: {
      tapeEcho: 235,
      digitalDelay: 241
    },
    reverb: {
      spring: 243,
      plate: 249,
      room: 256,
      hall: 254
    },
    cabinetSymbolToIndex: {
      145: 16
    }
  }
};

export const thrTypeCode = {
  float32: 0x00000004,
  bool: 0x00000003,
  enum: 0x00000002
};

export const thrOpcode = {
  requestUserSettingsDump: 0x0000000c,
  uploadUserSettingsDump: 0x0000000d,
  setGlobalOrType: 0x00000008,
  askGlobal: 0x00000009,
  setParameter: 0x0000000a,
  // Memory slot (preset) select: words [opcode, 4, slot index 0..4, 0] (legacy sendPreset).
  presetSelect: 0x0000000e
};

export const thrDumpProtocol = {
  actualTargetU32: 0xffffffff,
  minSlot: 0,
  maxSlot: 4,
  defaultUploadChunkDecodedSize: 210,
  // Upload header after the 3 length/target words carries 3 constant words.
  defaultUploadTailWords: [0x00000000, 0x00000001, 0x00000000]
};

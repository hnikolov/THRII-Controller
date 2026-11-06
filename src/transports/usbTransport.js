export function createUsbTransport(onBytes) {
  let output = null;
  let input = null;
  const onMidiMessage = event => onBytes(new Uint8Array(event.data), 'USB');

  return {
    attach(midiAccess) {
      const outputs = Array.from(midiAccess.outputs.values());
      const inputs = Array.from(midiAccess.inputs.values());
      output = outputs[0] || null;
      input = inputs.find(i => output && i.name === output.name) || inputs[0] || null;
      if (input) input.addEventListener('midimessage', onMidiMessage);
      return { connected: !!output || !!input };
    },

    detach() {
      if (input) input.removeEventListener('midimessage', onMidiMessage);
      input = null;
      output = null;
    },

    ports: () => ({ output, input }),
    isConnected: () => !!output,
    send(bytes) {
      output.send(Array.from(bytes));
    }
  };
}

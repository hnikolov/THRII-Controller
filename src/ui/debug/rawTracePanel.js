export function mountRawTracePanel(rootEl, observer) {
  const pre = document.createElement('pre');
  pre.className = 'raw-trace';
  rootEl.append(pre);

  function render() {
    pre.textContent = observer.frames()
      .map(f => (f.hex ? f.label + ': ' + f.hex : f.label))
      .join('\n');
    pre.scrollTop = pre.scrollHeight;
  }

  observer.subscribe(render);
  render();
}

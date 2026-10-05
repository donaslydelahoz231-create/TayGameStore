// Polyfill mínimo para navegadores sin Element.prototype.replaceChildren.
if (!Element.prototype.replaceChildren) {
  Element.prototype.replaceChildren = function (...nodes) {
    while (this.firstChild) this.removeChild(this.firstChild);
    for (const node of nodes) {
      this.append(node);
    }
  };
}

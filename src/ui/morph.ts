// Minimal DOM morphing: update an element to match new HTML while keeping the
// existing nodes (buttons, inputs) alive. Replacing innerHTML many times per
// second destroys the element under the user's finger and the tap is lost.

const tpl = document.createElement('template');

export function morph(el: Element, html: string) {
  if ((el as any).__html === html) return;
  (el as any).__html = html;
  tpl.innerHTML = html;
  patchChildren(el, tpl.content);
}

function patchChildren(target: Node, source: Node) {
  const tKids = Array.from(target.childNodes);
  const sKids = Array.from(source.childNodes);
  for (let i = 0; i < sKids.length; i++) {
    const s = sKids[i];
    const t = tKids[i];
    if (!t) { target.appendChild(s.cloneNode(true)); continue; }
    patchNode(target, t, s);
  }
  for (let i = sKids.length; i < tKids.length; i++) target.removeChild(tKids[i]);
}

function patchNode(parent: Node, t: Node, s: Node) {
  if (t.nodeType !== s.nodeType || t.nodeName !== s.nodeName) { parent.replaceChild(s.cloneNode(true), t); return; }
  if (t.nodeType === Node.TEXT_NODE || t.nodeType === Node.COMMENT_NODE) {
    if (t.nodeValue !== s.nodeValue) t.nodeValue = s.nodeValue;
    return;
  }
  if (t.nodeType !== Node.ELEMENT_NODE) return;
  const te = t as Element, se = s as Element;
  // attributes
  for (const a of Array.from(te.attributes)) if (!se.hasAttribute(a.name)) te.removeAttribute(a.name);
  for (const a of Array.from(se.attributes)) if (te.getAttribute(a.name) !== a.value) te.setAttribute(a.name, a.value);
  // keep live input values unless the user is not touching them
  if (te instanceof HTMLInputElement && se instanceof HTMLInputElement) {
    if (document.activeElement !== te && te.value !== se.value) te.value = se.value;
    if (te.checked !== se.checked) te.checked = se.checked;
    return;
  }
  if (te instanceof HTMLSelectElement) {
    // keep user's selection; options rarely change
    return;
  }
  patchChildren(te, se);
}

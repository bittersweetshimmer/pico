const is_text = vnode => vnode?.hasOwnProperty('text') ?? false;
const is_element = vnode => vnode?.hasOwnProperty('tagname') ?? false;

const PicoListeners = Symbol('PicoListeners');

const patch_attribute = (node, attribute_name, old_value, new_value, listener) => {
    if (attribute_name.substr(0, 2) === 'on') {
        const event_name = attribute_name.substr(2);
        if (new_value === null) {
            node.removeEventListener(event_name, listener);
            delete node[PicoListeners][event_name];
        }
        else if (old_value !== new_value) {
            node[PicoListeners][event_name] = new_value;
            node.addEventListener(event_name, listener);
        }
    }
    else {
        if (new_value === null) node.removeAttribute(attribute_name);
        else if (old_value !== new_value) node.setAttribute(attribute_name, new_value);
    }
};

const patch_attributes = (node, old_attributes, new_attributes, listener) => {
    for (const attribute_name of [...Object.keys(old_attributes), ...Object.keys(new_attributes)]) {
        patch_attribute(node, attribute_name, old_attributes[attribute_name], new_attributes[attribute_name], listener);
    }
};

const make_node = (vnode, listener) => {
    if (is_text(vnode)) {
        const node = document.createTextNode(vnode.text);
        return node;
    }
    else {
        const node = document.createElement(vnode.tagname);
        node[PicoListeners] = {};
        patch_attributes(node, {}, vnode.attributes, listener);
        for (const child of vnode.children) node.appendChild(make_node(child, listener));
        return node;
    }
};

export const h = (tagname, attributes, children = []) => ({ tagname, attributes, children: Array.isArray(children) ? children : [children] });
export const text = (value) => ({ text: value });

const recycle_node = node => node.nodeType === Node.TEXT_NODE
    ? text(node.nodeValue, node)
    : h(node.nodeName.toLowerCase(), {}, Array.from(node.childNodes).map(recycle_node), node);

const patch = (node, old_vnode, new_vnode, listener) => {
    if (old_vnode === new_vnode) return node; // if there was no change at all, do nothing
    else if (!(new_vnode ?? false)) { 
        // if new vnode is null/undefined, remove node

        node.remove();
        return null;
    }
    else if (is_text(old_vnode) && is_text(new_vnode)) {
        // if both previous and next vnodes are text nodes change change content

        if (old_vnode.text !== new_vnode.text) node.nodeValue = new_vnode.text;
        return node;
    }
    else if (is_element(old_vnode) && is_element(new_vnode) && old_vnode?.tagname === new_vnode?.tagname) {
        // if both previous and next vnodes are elements with the same tag, patch all attributes and children

        patch_attributes(node, old_vnode.attributes, new_vnode.attributes, listener);
        for (let i = 0; i < node.childNodes.length; ++i) patch(node.childNodes[i], old_vnode.children[i], new_vnode.children[i], listener);
        for (let i = node.childNodes.length; i < new_vnode.children.length; ++i) node.appendChild(make_node(new_vnode.children[i], listener));
        return node;
    }
    else {
        // if can't be patched

        const new_node = make_node(new_vnode, listener);
        node.replaceWith(new_node);
        return new_node;
    }
};

export const run = ({ init, update, view, node }) => {
    let vdom = recycle_node(node);
    let model = init;

    function render() {
        const next_vdom = view(model);
        node = patch(node, vdom, next_vdom, listener);
        vdom = next_vdom;
    };

    function set_model(next_model) {
        if (model !== next_model) {
            model = next_model;
            window.requestAnimationFrame(render);
        }
    }

    async function dispatch(action) {
        if (action?.next instanceof Function) {
            while (true) {
                const { value: next_action, done } = await action.next(model);

                if (next_action) await dispatch(next_action);
                if (done) break;
            }
        }
        else {
            set_model(update(await action, model));
        }
    }

    function listener(event) { dispatch(this[PicoListeners][event.type](event)); }

    window.requestAnimationFrame(render);
};

export default {
    h, text, run
};

// @flow
import {createText} from '.';
import {getActiveViewModel} from './OutlineView';

let nodeKeyCounter = 0;

export const IS_IMMUTABLE = 1;
export const IS_SEGMENTED = 1 << 1;

function removeNode(nodeToRemove: Node): void {
  const parent = nodeToRemove.getParent();
  if (parent === null) {
    return;
  }
  // $FlowFixMe too many arguments
  const writableParent = getWritableNode(parent, true);
  const parentChildren = writableParent._children;
  const key = nodeToRemove._key;
  const index = parentChildren.indexOf(key);
  if (index > -1) {
    parentChildren.splice(index, 1);
  }
  // Detach parent
  const writableNodeToRemove = getWritableNode(nodeToRemove);
  writableNodeToRemove._parent = null;
  writableNodeToRemove._key = null;
  // Remove children
  if (!nodeToRemove.isText()) {
    // $FlowFixMe refine this. We know the node is not text so it must have children.
    const children = nodeToRemove.getChildren();
    for (let i = 0; i < children.length; i++) {
      children[i].remove();
    }
  }
  // Remove key from node map
  const viewModel = getActiveViewModel();
  delete viewModel.nodeMap[(key: $FlowFixMeThisCanBeNull)];
}

type $FlowFixMeThisCanBeNull = $FlowFixMe;
type $FlowFixMeUsingNumberAsString = $FlowFixMe;

function replaceNode<N: Node>(toReplace: Node, replaceWith: N): N {
  const writableReplaceWith = getWritableNode(replaceWith);
  const oldParent = writableReplaceWith.getParent();
  if (oldParent !== null) {
    const writableParent = getWritableNode(
      (oldParent: $FlowFixMeThisCanBeNull),
    );
    const children = writableParent._children;
    const index = children.indexOf(writableReplaceWith._key);
    if (index > -1) {
      children.splice(index, 1);
    }
  }
  const newParent = toReplace.getParent();
  const writableParent = getWritableNode((newParent: $FlowFixMeThisCanBeNull));
  const children = writableParent._children;
  const index = children.indexOf(toReplace._key);
  if (index > -1) {
    children.splice(index, 0, replaceWith._key);
  }
  writableReplaceWith._parent = (newParent: $FlowFixMeThisCanBeNull)._key;
  toReplace.remove();
  return writableReplaceWith;
}

function wrapInTextNodes<N: Node>(node: N): N {
  const prevSibling: $FlowFixMeThisCanBeNull = node.getPreviousSibling();
  if (
    prevSibling === null ||
    !prevSibling.isText() ||
    prevSibling.isImmutable() ||
    prevSibling.isSegmented()
  ) {
    const text = createText('');
    node.insertBefore(text);
  }
  const nextSibling: $FlowFixMeThisCanBeNull = node.getNextSibling();
  if (
    nextSibling === null ||
    !nextSibling.isText() ||
    nextSibling.isImmutable() ||
    nextSibling.isSegmented()
  ) {
    const text = createText('');
    node.insertAfter(text);
  }
  (node.getParent(): $FlowFixMeThisCanBeNull).normalizeTextNodes(true);
  return node;
}

type NodeKey = string;

export class Node {
  _flags: number;
  _key: null | NodeKey;
  _parent: null | NodeKey;
  // TODO: Figure out how to type "_type".
  _type: any;
  constructor() {
    this._flags = 0;
    this._key = null;
    this._parent = null;
    this._type = 'node';
  }

  // Getters and Traversors

  getFlags(): number {
    const self = this.getLatest();
    return self._flags;
  }
  getKey(): NodeKey | null {
    // Key is stable between copies
    return this._key;
  }
  getType(): string {
    // Type is stable between copies
    return this._type;
  }
  getParent(): ParentNode | null {
    const parent = this.getLatest()._parent;
    if (parent === null) {
      return null;
    }
    return getNodeByKey(parent);
  }
  getParentBefore(target: Node): Node | null {
    let node = this;
    while (node !== null) {
      const parent = node.getParent();
      if ((parent: $FlowFixMeThisCanBeNull)._key === target._key) {
        return node;
      }
      node = parent;
    }
    return null;
  }
  getParentBlock(): Node | null {
    let node: $FlowFixMeThisCanBeNull = this;
    while (node !== null) {
      if (node.isBlock()) {
        return node;
      }
      node = node.getParent();
    }
    return null;
  }
  getParents(): Array<ParentNode | null> {
    const parents = [];
    let node = this.getParent();
    while (node !== null) {
      parents.push(node);
      node = node.getParent();
    }
    return parents;
  }
  getPreviousSibling(): Node | null {
    const parent = this.getParent();
    const children = (parent: $FlowFixMeThisCanBeNull)._children;
    const index = children.indexOf(this._key);
    if (index <= 0) {
      return null;
    }
    return getNodeByKey(children[index - 1]);
  }
  getPreviousSiblings(): Array<Node> | null {
    const parent = this.getParent();
    const children = (parent: $FlowFixMeThisCanBeNull)._children;
    const index = children.indexOf(this._key);
    return children.slice(0, index).map((childKey) => getNodeByKey(childKey));
  }
  getNextSibling(): Node | null {
    const parent = this.getParent();
    const children = (parent: $FlowFixMeThisCanBeNull)._children;
    const childrenLength = children.length;
    const index = children.indexOf(this._key);
    if (index >= childrenLength - 1) {
      return null;
    }
    return getNodeByKey(children[index + 1]);
  }
  getNextSiblings(): Array<Node> {
    const parent = this.getParent();
    const children = (parent: $FlowFixMeThisCanBeNull)._children;
    const index = children.indexOf(this._key);
    return children.slice(index + 1).map((childKey) => getNodeByKey(childKey));
  }

  getCommonAncestor(node: Node): ParentNode | null {
    const a = this.getParents();
    const b = node.getParents();
    const aLength = a.length;
    const bLength = b.length;
    if (aLength === 0 || bLength === 0 || a[aLength - 1] !== b[bLength - 1]) {
      return null;
    }
    const bSet = new Set(b);
    for (let i = 0; i < aLength; i++) {
      const ancestor = a[i];
      if (bSet.has(ancestor)) {
        return ancestor;
      }
    }
    return null;
  }

  isBefore(targetNode: Node): boolean {
    const commonAncestor = this.getCommonAncestor(targetNode);
    let indexA = 0;
    let indexB = 0;
    let node = this;
    while (true) {
      const parent = (node: $FlowFixMeThisCanBeNull).getParent();
      if (parent === commonAncestor) {
        indexA = parent._children.indexOf(node._key);
        break;
      }
      node = parent;
    }
    node = targetNode;
    while (true) {
      const parent = (node: $FlowFixMeThisCanBeNull).getParent();
      if (parent === commonAncestor) {
        indexB = parent._children.indexOf(node._key);
        break;
      }
      node = parent;
    }
    return indexA < indexB;
  }

  isParentOf(targetNode: Node): boolean {
    const key = this._key;
    let node: $FlowFixMeThisCanBeNull = targetNode;
    while (node !== null) {
      if (node._key === key) {
        return true;
      }
      node = node.getParent();
    }
    return false;
  }

  getNodesBetween(targetNode: Node): null | Array<Node> {
    const isBefore = this.isBefore(targetNode);
    const nodes = [];

    if (isBefore) {
      let node: $FlowFixMeThisCanBeNull = this;
      while (true) {
        nodes.push(node);
        if (node === targetNode) {
          break;
        }
        const child = node.isBlock() ? node.getFirstChild() : null;
        if (child !== null) {
          node = child;
          continue;
        }
        const nextSibling = node.getNextSibling();
        if (nextSibling !== null) {
          node = nextSibling;
          continue;
        }
        const parent = node.getParent();
        if (parent === null) {
          return null;
        }
        nodes.push(parent);
        let parentSibling = null;
        let ancestor = parent;
        do {
          if (ancestor === null) {
            return null;
          }
          parentSibling = ancestor.getNextSibling();
          ancestor = ancestor.getParent();
        } while (parentSibling === null);
        node = parentSibling;
      }
    } else {
      let node: $FlowFixMeThisCanBeNull = this;
      while (true) {
        nodes.push(node);
        if (node === targetNode) {
          break;
        }
        const child = node.isBlock() ? node.getLastChild() : null;
        if (child !== null) {
          node = child;
          continue;
        }
        const prevSibling = node.getPreviousSibling();
        if (prevSibling !== null) {
          node = prevSibling;
          continue;
        }
        const parent = node.getParent();
        if (parent === null) {
          return null;
        }
        nodes.push(parent);
        let parentSibling = null;
        let ancestor = parent;
        do {
          if (ancestor === null) {
            return null;
          }
          parentSibling = ancestor.getPreviousSibling();
          ancestor = ancestor.getParent();
        } while (parentSibling === null);
        node = parentSibling;
      }
      nodes.reverse();
    }
    return nodes;
  }

  isBody(): boolean {
    return false;
  }
  isHeader(): boolean {
    return false;
  }
  isBlock(): boolean {
    return false;
  }
  isText(): boolean {
    return false;
  }
  isImmutable(): boolean {
    return (this.getLatest()._flags & IS_IMMUTABLE) !== 0;
  }
  isSegmented(): boolean {
    return (this.getLatest()._flags & IS_SEGMENTED) !== 0;
  }

  // TODO: Figure out how to type this, since if its called from
  // a subclass it should return a node of the subclass' type.
  getLatest(): $FlowFixMe {
    if (this._key === null) {
      return this;
    }
    const latest = getNodeByKey(this._key);
    if (latest === null) {
      return this;
    }
    return latest;
  }

  getTextContent(): string {
    if (this.isText()) {
      return this.getTextContent();
    }
    let textContent = '';
    // $FlowFixMe we don't know that this has getChildren()
    const children = this.getChildren();
    const childrenLength = children.length;
    for (let i = 0; i < childrenLength; i++) {
      const child = children[i];
      textContent += child.getTextContent();
      if (child.isBlock() && i !== childrenLength - 1) {
        textContent += '\n\n';
      }
    }
    return textContent;
  }

  // Setters and mutators

  setFlags(flags: number): Node {
    if (this.isImmutable()) {
      throw new Error('setFlags: can only be used on non-immutable nodes');
    }
    const self = getWritableNode(this);
    self._flags = flags;
    return self;
  }
  makeImmutable(): Node {
    const self = getWritableNode(this);
    self._flags |= IS_IMMUTABLE;
    return self;
  }
  makeSegmented(): Node {
    const self = getWritableNode(this);
    self._flags |= IS_SEGMENTED;
    return self;
  }
  remove(): void {
    return removeNode(this);
  }
  wrapInTextNodes(): Node {
    return wrapInTextNodes(this);
  }
  // TODO add support for replacing with multiple nodes?
  replace<N: Node>(targetNode: N): N {
    return replaceNode(this, targetNode);
  }
  // TODO add support for inserting multiple nodes?
  insertAfter(nodeToInsert: Node): Node {
    const writableSelf = getWritableNode(this);
    const writableNodeToInsert = getWritableNode(nodeToInsert);
    const oldParent = writableNodeToInsert.getParent();
    if (oldParent !== null) {
      const writableParent = getWritableNode(oldParent);
      const children = writableParent._children;
      const index = children.indexOf(writableNodeToInsert._key);
      if (index > -1) {
        children.splice(index, 1);
      }
    }
    const writableParent: ParentNode = getWritableNode(
      (this.getParent(): $FlowFixMeThisCanBeNull),
    );
    const insertKey = nodeToInsert._key;
    writableNodeToInsert._parent = writableSelf._parent;
    const children = writableParent._children;
    const index = children.indexOf(writableSelf._key);
    if (index > -1) {
      children.splice(index + 1, 0, (insertKey: $FlowFixMeThisCanBeNull));
    }
    return writableSelf;
  }
  // TODO add support for inserting multiple nodes?
  insertBefore(nodeToInsert: Node): Node {
    const writableSelf = getWritableNode(this);
    const writableNodeToInsert = getWritableNode(nodeToInsert);
    const oldParent = writableNodeToInsert.getParent();
    if (oldParent !== null) {
      const writableParent = getWritableNode(oldParent);
      const children = writableParent._children;
      const index = children.indexOf(writableNodeToInsert._key);
      if (index > -1) {
        children.splice(index, 1);
      }
    }
    const writableParent: ParentNode = getWritableNode(
      (this.getParent(): $FlowFixMeThisCanBeNull),
    );
    const insertKey: $FlowFixMeThisCanBeNull = nodeToInsert._key;
    writableNodeToInsert._parent = writableSelf._parent;
    const children = writableParent._children;
    const index = children.indexOf(writableSelf._key);
    if (index > -1) {
      children.splice(index, 0, insertKey);
    }
    return writableSelf;
  }
}

declare class ParentNode extends Node {
  _children: Array<NodeKey>;
}

// NOTE: we could make a mutable node type

export function getWritableNode<N: Node>(node: N): N {
  const viewModel = getActiveViewModel();
  const dirtyNodes: Set<NodeKey> = (viewModel._dirtyNodes: $FlowFixMe);
  const nodeMap = viewModel.nodeMap;
  const key = node._key;
  if (key === null) {
    const newKey = (node._key = (nodeKeyCounter++: $FlowFixMeUsingNumberAsString));
    dirtyNodes.add(newKey);
    nodeMap[newKey] = node;
    return node;
  }
  // Ensure we get the latest node from pending state
  node = node.getLatest();
  const parent = node._parent;
  if (parent !== null) {
    const dirtySubTrees = viewModel._dirtySubTrees;
    markParentsAsDirty(
      parent,
      nodeMap,
      (dirtySubTrees: $FlowFixMeThisCanBeNull),
    );
  }
  if (dirtyNodes.has(key)) {
    return node;
  }
  // $FlowFixMe we don't know that clone() exists
  const mutableNode = node.clone();
  if (mutableNode._type !== node._type) {
    throw new Error(
      node.constructor.name +
        ': "clone" method was either missing or incorrectly implemented.',
    );
  }
  mutableNode._key = key;
  // If we're mutating the body node, make sure to update
  // the pointer in state too.
  if (mutableNode.isBody()) {
    viewModel.body = mutableNode;
  }
  dirtyNodes.add(key);
  nodeMap[key] = mutableNode;
  return mutableNode;
}

function markParentsAsDirty(
  parentKey: NodeKey,
  nodeMap,
  dirtySubTrees: Set<NodeKey>,
): void {
  while (parentKey !== null) {
    if (dirtySubTrees.has(parentKey)) {
      return;
    }
    dirtySubTrees.add(parentKey);
    parentKey = nodeMap[parentKey]._parent;
  }
}

export function getNodeByKey<N: Node>(key: NodeKey): N | null {
  const viewModel = getActiveViewModel();
  const node = viewModel.nodeMap[key];
  if (node === undefined) {
    return null;
  }
  return node;
}
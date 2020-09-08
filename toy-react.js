const RENDER_TO_DOM = Symbol('render to dom')

/**
 * 流程2：Component返回一个对象
 * {
 *    vdom:该对象本身
 *    range:RENDER_TO_DOM方法
 *    props:
 *    children:
 * }
 * 用对象上的属性和方法达到ElementWrapper
 */
export class Component {
  constructor() {
    this.props = Object.create(null)
    this.children = []
    this._range = null
  }
  // getter可以起到延迟计算的作用，因为render方法是子类实现的，目前还没有存在
  get vdom() {
    return this.render().vdom
  }
  setAttribute(name, value) {
    this.props[name] = value
  }
  appendChild(component) {
    this.children.push(component)
  }
  [RENDER_TO_DOM](range) {
    this._range = range
    this._vdom = this.vdom
    this._vdom[RENDER_TO_DOM](range)
  }
  update() {
    let isSameNode = (oldNode, newNode) => {
      if (oldNode.type !== newNode.type) {
        return false
      }
      for (let name in newNode.props) {
        if (oldNode.props[name] !== newNode.props[name]) {
          return false
        }
      }
      if (Object.keys(oldNode.props).length > Object.keys(newNode.props).length) {
        return false
      }
      if (newNode.type === '#text') {
        if (newNode.content !== oldNode.content) {
          return false
        }
      }
      return true
    }
    let update = (oldNode, newNode) => {
      if (!isSameNode(oldNode, newNode)) {
        newNode[RENDER_TO_DOM](oldNode._range)
        return
      }
      newNode._range = oldNode._range
      let newChildren = newNode.vchildren
      let oldChildren = oldNode.vchildren
      if (!newChildren || !newChildren.length) {
        return
      }
      let tailRange = oldChildren[oldChildren.length - 1]._range
      for (let i = 0; i < newChildren.length; i++) {
        let newChild = newChildren[i]
        let oldChild = oldChildren[i]
        if (i < oldChildren.length) {
          update(oldChild, newChild)
        } else {
          let range = document.createRange()
          range.setStart(tailRange.endContainer, tailRange.endOffset)
          range.setEnd(tailRange.endContainer, tailRange.endOffset)
          newChild[RENDER_TO_DOM](range)
          tailRange = range
        }
      }
    }
    let vdom = this.vdom
    update(this._vdom, vdom)
    this._vdom = vdom
  }
  setState(newState) {
    if (this.state === null || typeof this.state !== 'object') {
      this.state = newState
      this.update()
      return
    }
    let merge = (oldState, newState) => {
      for (let p in newState) {
        if (oldState[p] === null || typeof oldState[p] !== 'object') {
          oldState[p] = newState[p]
        } else {
          merge(oldState[p], newState[p])
        }
      }
    }
    merge(this.state, newState)
    this.update()
  }
}

/**
 * 流程2：ElementWrapper返回一个对象
 * {
 *    vdom: 该对象本身
 *    props: 属性
 *    children: 子节点
 *    vchildren: children的vdom映射
 *    _range:RENDER_TO_DOM方法，该节点的位置
 *    type: html标签名
 * }
 * 用对象上的属性和方法达到ElementWrapper
 */
class ElementWrapper extends Component {
  constructor(type) {
    super(type)
    this.type = type
  }
  // getter起延迟计算的作用，children在constructor里面还是空数组，
  // 在createElemnt函数中调用appendChild之后才填充上
  get vdom() {
    this.vchildren = this.children.map((child) => child.vdom)
    return this
  }
  [RENDER_TO_DOM](range) {
    this._range = range
    let root = document.createElement(this.type)
    for (let name in this.props) {
      let value = this.props[name]
      if (name.match(/^on([\s\S]+)$/)) {
        root.addEventListener(
          RegExp.$1.replace(/^[\s\S]/, (c) => c.toLowerCase()),
          value
        )
      } else {
        if (name === 'className') {
          root.setAttribute('class', value)
        } else {
          root.setAttribute(name, value)
        }
      }
    }
    if (!this.vchildren) {
      this.vchildren = this.children.map((child) => child.vdom)
    }
    for (let child of this.vchildren) {
      let childRange = document.createRange()
      childRange.setStart(root, root.childNodes.length)
      childRange.setEnd(root, root.childNodes.length)
      child[RENDER_TO_DOM](childRange)
    }
    repalceContent(range, root)
  }
}
class TextWrapper extends Component {
  constructor(content) {
    super(content)
    this.type = '#text'
    this.content = content
  }
  get vdom() {
    return this
  }
  [RENDER_TO_DOM](range) {
    this._range = range
    let root = document.createTextNode(this.content)
    repalceContent(range, root)
  }
}

// 流程1.jsx被babel编译成createElement，最终返回一个ElemmentWrapper
/**
 * 节点是一个原生html标签，直接调用ElementWrapper
 * 节点是一个继承component组件，会递归insertChildren直到变成全部是原生html标签，形成ElementWrapper
 */
export function createElement(type, attributes, ...children) {
  let e
  if (typeof type == 'string') {
    e = new ElementWrapper(type)
    console.log('元素类型string', type)
  } else {
    e = new type()
    console.log('元素类型function', type)
  }
  for (let p in attributes) {
    e.setAttribute(p, attributes[p])
  }
  let insertChildren = (children) => {
    for (let child of children) {
      if (typeof child === 'string') {
        child = new TextWrapper(child)
      }
      if (child === null) {
        continue
      }
      if (typeof child === 'object' && child instanceof Array) {
        insertChildren(child)
      } else {
        e.appendChild(child)
      }
    }
  }
  insertChildren(children)
  return e
}

export function render(component, parentElement) {
  let range = document.createRange()
  range.setStart(parentElement, 0)
  range.setEnd(parentElement, parentElement.childNodes.length)
  range.deleteContents()
  component[RENDER_TO_DOM](range)
}
function repalceContent(range, node) {
  range.insertNode(node)
  range.setStartAfter(node)
  range.deleteContents()
  range.setStartBefore(node)
  range.setEndAfter(node)
}

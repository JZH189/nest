# JavaScript 中 call 与 apply 的区别

在 JavaScript 中，`call` 和 `apply` 都是函数对象的方法，它们的核心作用只有一个：

> 强制指定函数执行时的 `this` 指向。

它们最大的区别在于：

| 方法 | 参数传递方式 |
| --- | --- |
| `call` | 一个个传参 |
| `apply` | 参数以数组形式传入 |

---

# 一、基础语法

## call

```js
fn.call(thisArg, arg1, arg2, arg3)
```

## apply

```js
fn.apply(thisArg, [arg1, arg2, arg3])
```

---

# 二、最通俗理解

你可以把：

- `call` 理解成：

> “帮我调用这个函数，并且参数一个个给”

- `apply` 理解成：

> “帮我调用这个函数，并且参数打包成数组给”

---

# 三、this 到底是什么

先看例子：

```js
const person = {
  name: 'Tom',
  say() {
    console.log(this.name);
  }
};

person.say();
```

输出：

```js
Tom
```

这里：

```js
this === person
```

因为是：

```js
person.say()
```

调用的。

---

# 四、call 修改 this

```js
function say(age, city) {
  console.log(this.name, age, city);
}

const user = {
  name: 'Jack'
};

say.call(user, 18, 'Shanghai');
```

---

# 五、apply 修改 this

```js
function say(age, city) {
  console.log(this.name, age, city);
}

const user = {
  name: 'Jack'
};

say.apply(user, [18, 'Shanghai']);
```

---

# 六、核心区别（重点）

## call

参数逐个传：

```js
fn.call(obj, 1, 2, 3)
```

## apply

参数数组传：

```js
fn.apply(obj, [1, 2, 3])
```

---

# 七、为什么会有 apply？

```js
const arr = [3, 8, 1, 10];

Math.max.apply(null, arr);
```

等价于：

```js
Math.max(3, 8, 1, 10)
```

ES6 后通常写成：

```js
Math.max(...arr)
```

---

# 八、和 bind 的区别

## call

立即执行：

```js
fn.call(obj)
```

## apply

立即执行：

```js
fn.apply(obj)
```

## bind

不执行，只返回新函数：

```js
const newFn = fn.bind(obj);

newFn();
```

---

# 九、一句话总结

## call

```js
fn.call(this, a, b, c)
```

适合：

- 参数明确
- 一个个传

## apply

```js
fn.apply(this, [a, b, c])
```

适合：

- 参数数量不确定
- 已经是数组

---

# 十、底层本质（高级理解）

实际上：

```js
fn.call(obj)
```

本质类似于：

```js
obj.fn = fn;
obj.fn();
delete obj.fn;
```

因为：

> JS 中谁“点”函数，谁就是 this。

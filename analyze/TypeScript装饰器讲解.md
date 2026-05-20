# TypeScript 装饰器通俗讲解

> 装饰器本质上就是一个**函数**，它可以在不修改原代码的前提下，给类、方法、属性等"贴标签"或"加功能"。
> 你可以把它想象成：**给手机套壳** —— 手机本身没变，但多了保护功能；**给照片加滤镜** —— 照片本身没变，但多了美颜效果。

---

## 目录

1. [类装饰器](#1-类装饰器class-decorator)
2. [方法装饰器](#2-方法装饰器method-decorator)
3. [属性装饰器](#3-属性装饰器property-decorator)
4. [参数装饰器](#4-参数装饰器parameter-decorator)
5. [访问器装饰器](#5-访问器装饰器accessor-decorator)
6. [装饰器工厂](#6-装饰器工厂)

---

## 1. 类装饰器（Class Decorator）

### 一句话理解

> **给整个类"加buff"**，比如给类加个默认属性、修改类的构造函数、或者打个日志记录类被创建了。

### 函数签名

```typescript
function classDecorator(target: Function): void | Function
// target 就是类的构造函数（constructor）
```

### 生活类比

学校给学生班级发统一班服 —— 不管班级里有什么学生，整体上都多了"班服"这个属性。

### Demo

```typescript
// 类装饰器：给类添加一个 createdAt 属性
function AddTimestamp(target: Function) {
  target.prototype.createdAt = new Date().toISOString();
}

@AddTimestamp
class User {
  name: string;
  constructor(name: string) {
    this.name = name;
  }
}

const user = new User("小明") as any;
console.log(user.name);       // 小明
console.log(user.createdAt);  // 2026-05-19T00:00:00.000Z
```

---

## 2. 方法装饰器（Method Decorator）

### 一句话理解

> **给某个方法"加特效"**，比如自动打印日志、控制执行时间、或者拦截方法的调用。

### 函数签名

```typescript
function methodDecorator(
  target: Object,            // 类的原型对象（静态方法时为构造函数）
  propertyKey: string,       // 方法名
  descriptor: PropertyDescriptor  // 方法描述符（包含 value, writable 等）
): void | PropertyDescriptor
```

### 生活类比

给空调遥控器的"开机键"贴个标签 —— 每次按开机键时，除了开机还会记录"谁在什么时间按了开机键"。

### Demo

```typescript
// 方法装饰器：自动打印方法的执行日志
function Log(target: Object, propertyKey: string, descriptor: PropertyDescriptor) {
  const originalMethod = descriptor.value; // 保存原始方法

  descriptor.value = function (...args: any[]) {
    console.log(`[LOG] 调用方法: ${propertyKey}，参数: ${JSON.stringify(args)}`);
    const result = originalMethod.apply(this, args);
    console.log(`[LOG] 方法 ${propertyKey} 执行完毕，返回值: ${result}`);
    return result;
  };
}

class Calculator {
  @Log
  add(a: number, b: number): number {
    return a + b;
  }

  @Log
  multiply(a: number, b: number): number {
    return a * b;
  }
}

const calc = new Calculator();
calc.add(3, 5);
// [LOG] 调用方法: add，参数: [3,5]
// [LOG] 方法 add 执行完毕，返回值: 8

calc.multiply(4, 6);
// [LOG] 调用方法: multiply，参数: [4,6]
// [LOG] 方法 multiply 执行完毕，返回值: 24
```

---

## 3. 属性装饰器（Property Decorator）

### 一句话理解

> **给某个属性"加约束"**，比如标记这个属性必填、设置默认值、或者记录属性的元数据。

### 函数签名

```typescript
function propertyDecorator(
  target: Object,       // 类的原型对象（静态属性时为构造函数）
  propertyKey: string   // 属性名
): void
```

### 生活类比

给行李箱贴"易碎品"标签 —— 行李箱还是那个行李箱，但搬运工看到标签后会更小心对待。

### Demo

```typescript
// 用一个 Map 来存储属性元数据
const requiredProps: Map<Function, string[]> = new Map();

// 属性装饰器：标记属性为"必填"
function Required(target: Object, propertyKey: string) {
  const constructor = target.constructor;
  if (!requiredProps.has(constructor)) {
    requiredProps.set(constructor, []);
  }
  requiredProps.get(constructor)!.push(propertyKey);
}

class Person {
  @Required
  name!: string;

  @Required
  age!: number;

  email?: string; // 没有装饰器，非必填
}

// 校验函数：检查所有必填属性是否已赋值
function validate(obj: any): boolean {
  const props = requiredProps.get(obj.constructor) || [];
  for (const prop of props) {
    if (obj[prop] === undefined || obj[prop] === null) {
      console.log(`校验失败: "${prop}" 是必填项！`);
      return false;
    }
  }
  console.log("校验通过！");
  return true;
}

const p1 = new Person();
p1.name = "小红";
p1.age = 18;
validate(p1);  // 校验通过！

const p2 = new Person();
p2.name = "小明";
validate(p2);  // 校验失败: "age" 是必填项！
```

---

## 4. 参数装饰器（Parameter Decorator）

### 一句话理解

> **给函数参数"加备注"**，比如标记这个参数必填、需要转大写、或者记录参数的位置和名称等元数据。

### 函数签名

```typescript
function parameterDecorator(
  target: Object,          // 类的原型对象（静态方法时为构造函数）
  propertyKey: string,     // 方法名
  parameterIndex: number   // 参数在参数列表中的位置（从0开始）
): void
```

### 生活类比

快递单上在"收件人"栏旁边标注"必须本人签收" —— 提醒快递员这个参数需要特殊处理。

### Demo

```typescript
// 用 Map 存储参数元数据
const paramMetadata: Map<Function, Map<string, number[]>> = new Map();

// 参数装饰器：标记参数为"需要校验"
function Validate(target: Object, propertyKey: string, parameterIndex: number) {
  const constructor = target.constructor;
  if (!paramMetadata.has(constructor)) {
    paramMetadata.set(constructor, new Map());
  }
  const methodMap = paramMetadata.get(constructor)!;
  if (!methodMap.has(propertyKey)) {
    methodMap.set(propertyKey, []);
  }
  methodMap.get(propertyKey)!.push(parameterIndex);
}

class UserService {
  // 标记第 0 个参数需要校验
  createUser(@Validate name: string, age: number) {
    console.log(`创建用户: ${name}, 年龄: ${age}`);
  }
}

// 查看元数据
const service = new UserService();
const methodMap = paramMetadata.get(UserService.prototype.constructor);
console.log(methodMap);
// Map { 'createUser' => [ 0 ] }  → 第0个参数（name）被标记为需要校验
```

---

## 5. 访问器装饰器（Accessor Decorator）

### 一句话理解

> **给 getter/setter "加拦截"**，比如在赋值时做格式校验、在取值时做格式转换。

### 函数签名

```typescript
function accessorDecorator(
  target: Object,                 // 类的原型对象（静态访问器时为构造函数）
  propertyKey: string,            // 访问器名
  descriptor: PropertyDescriptor  // 描述符（包含 get/set）
): void | PropertyDescriptor
```

### 生活类比

给保险箱的"取钱口"装了台验钞机 —— 存进去时自动检验真伪，取出来时自动点清金额。

### Demo

```typescript
// 访问器装饰器：set 时自动 trim 字符串
function Trim(target: Object, propertyKey: string, descriptor: PropertyDescriptor) {
  const originalSetter = descriptor.set!;

  descriptor.set = function (value: string) {
    const trimmed = value.trim(); // 去掉首尾空格
    console.log(`[Trim] "${value}" → "${trimmed}"`);
    originalSetter.call(this, trimmed);
  };
}

class Form {
  private _username: string = "";

  @Trim
  get username(): string {
    return this._username;
  }

  set username(value: string) {
    this._username = value;
  }
}

const form = new Form();
form.username = "   小红   ";
// [Trim] "   小红   " → "小红"

console.log(form.username);  // "小红"（首尾空格被自动去掉）
```

---

## 6. 装饰器工厂

### 一句话理解

> 上面5种装饰器是**固定效果**的，而装饰器工厂让你可以**传参定制效果** —— 就像从"买现成的蛋糕"变成"定制蛋糕"。

### 模式

```typescript
// 装饰器工厂 = 一个返回装饰器函数的函数
function DecoratorFactory(自定义参数) {
  return function (target, propertyKey, descriptor) {
    // 根据参数做不同的事
  };
}

// 使用时需要加括号传参
@DecoratorFactory("参数值")
```

### Demo

```typescript
// 方法装饰器工厂：设置超时时间
function Timeout(ms: number) {
  return function (target: Object, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;

    descriptor.value = function (...args: any[]) {
      const promise = originalMethod.apply(this, args);

      // 如果返回的是 Promise，则加上超时控制
      if (promise instanceof Promise) {
        return Promise.race([
          promise,
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error(`${propertyKey} 超时（${ms}ms）`)), ms)
          ),
        ]);
      }

      return promise;
    };
  };
}

class ApiService {
  @Timeout(3000) // 3秒超时
  async fetchData(): Promise<string> {
    const data = await new Promise<string>((resolve) =>
      setTimeout(() => resolve("数据加载完成"), 5000) // 模拟5秒才能拿到数据
    );
    return data;
  }

  @Timeout(5000) // 5秒超时
  async fetchQuick(): Promise<string> {
    const data = await new Promise<string>((resolve) =>
      setTimeout(() => resolve("快速数据加载完成"), 1000)
    );
    return data;
  }
}

const api = new ApiService();

api.fetchData().catch(console.error);
// Error: fetchData 超时（3000ms）

api.fetchQuick().then(console.log);
// 快速数据加载完成
```

---

## 装饰器执行顺序

当多个装饰器叠加使用时，执行顺序遵循 **"从外到内，从下到上"** 的规则：

```typescript
@classDecorator                   // 3. 最后执行（类装饰器）
class Demo {
  @propertyDecorator              // 1. 先执行（属性装饰器）
  name!: string;

  @methodDecorator                // 2.2 方法装饰器
  method(@paramDecorator p: string) {}  // 2.1 参数装饰器（比方法装饰器先）
}
```

同一位置多个装饰器，**从下往上**执行：

```typescript
@DecoratorA   // 后执行（外层）
@DecoratorB   // 先执行（内层）
method() {}
```

---

## 总结速查表

| 装饰器类型 | 装饰对象 | 函数参数 | 常见用途 |
|---|---|---|---|
| **类装饰器** | `class` | `target` | 添加属性/方法、修改构造函数 |
| **方法装饰器** | 方法 | `target, propertyKey, descriptor` | 日志、权限、性能计时 |
| **属性装饰器** | 属性 | `target, propertyKey` | 标记元数据、校验规则 |
| **参数装饰器** | 参数 | `target, propertyKey, parameterIndex` | 参数校验、依赖注入 |
| **访问器装饰器** | getter/setter | `target, propertyKey, descriptor` | 格式化、拦截赋值 |

> **一句话总结**：装饰器 = 不改原代码 + 加功能 + 可叠加，就像给对象穿装备，越穿越强！

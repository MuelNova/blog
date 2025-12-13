---
title: 从零开始的 Python AsyncIO 生活
description: 从迭代器开始，一步一步进阶到 AsyncIO
pubDate: 2022-12-31
tags:
- Python
- Investigate
authors:
- nova

---
---
title: From Zero to Python AsyncIO Life
date: 2022-12-31
tags: [Python, investigate]
authors: [nova]
---

I've been using `AsyncIO` for asynchronous programming in `Python`, but I've never thought about why. Let's take this opportunity to understand `AsyncIO` better.

# Starting from Iterators

## Iterable

First of all, we need to understand what an `Iterable` is, which is basically an object that can be used in a `for` loop. Common examples of `Iterable` include `list`, `str`, `tuple`, and `dict`.

In Python, how does it determine if an object is an `Iterable`? We can use the `dir()` function to check its attribute list.

By running the following code, we can see their common interface:

```python
from typing import Iterable

iterable = [
    "",    # str
    [],    # list
    {},    # dict
    (),    # tuple
    set()  # set
]

def show_diff(*objects: Iterable):
    """Print the attribute differences between Iterable and object"""
    assert objects
    attrs = set(dir(objects[0]))
    for obj in objects[1:]:
        attrs &= set(dir(obj))  # Get the intersection of Iterables
    attrs -= set(dir(object))  # Get the difference between Iterable and object
    print(attrs)

show_diff(*iterable)

# {'__iter__', '__contains__', '__len__'}
```

As we can see, the key attribute is `__iter__`. In fact, for any object that has the `__iter__` method specified, it will be considered an `Iterable`. Attributes like `__len__` and `__contains__` are common to `container` type Iterables.

If we add a `non-container` type `Iterable`, the result becomes obvious:

```python
iterable = [
    "",    # str
    [],    # list
    {},    # dict
    (),    # tuple
    set(),  # set
    open(__file__)  # IO
]

show_diff(*iterable)

# {'__iter__'}
```

## Iterator

In Python, methods like `__iter__` in Iterables have corresponding calling methods, which is `iter()`.

Let's see the results when we use `iter()` on the `container` type Iterables listed above:

```python
for i in iterable:
    print(iter(i))

"""
<str_iterator object at 0x7f7bd06fafe0>
<list_iterator object at 0x7f7bd06fafe0>
<dict_keyiterator object at 0x7f7bd08c4b80>
<tuple_iterator object at 0x7f7bd06fafe0>
<set_iterator object at 0x7f7bd0720440>
"""
```

We can see that they all return an `Iterator` object. As demonstrated in the `Iterable` section, let's once again find the attribute differences among them:

```python
# {'__next__', '__iter__'}
```

So, compared to `Iterable`, there is an additional `__next__` method in `Iterator`, which is used to return data in the next iteration.

In the end, after all values have been iterated, it will raise a `StopIteration` error to indicate the end of the iteration.

We can build a custom Iterator with the following code:

```python
class MyIterator:
    def __init__(self, Iter):
        self.index = 0
        self.data = Iter

    def __next__(self):
        while self.index < len(self.data):
            data = self.data[self.index]
            self.index += 1
            return data
        raise StopIteration

    def __iter__(self):
        """Iterators must be iterable"""
        return self

things = ["I", "AM", "ITERABLE", "GOD"]

for i in MyIterator(things):
    print(i)
```

Stay tuned for the next parts!```python
task...")
t1 = time.time()
await Awaitable(sleep, 2)
assert time.time() - t1 > 2, "You didn't block, silly pig"
print(" I'm finished")
return 123

class Awaitable:
def **init**(self, \*obj):
self.obj = obj

    def __await__(self):
        yield self.obj

class Task:
def **init**(self, \_task):
self.coro = \_task

    def run(self):
        while True:
            try:
                x = self.coro.send(None)
            except StopIteration as _e:
                result = _e.value
                break
            else:
                func, arg = x
                func(arg)
        return result

Task(task()).run()

````

Returning to our `small_step`, we are using a hard-coded blocking mechanism `sleep(2)`, but in reality, there are more types of blocking than just this one. We should aim for a more general mechanism for blocking.

In `Awaitable`, we are directly yielding `self`.

```python
class Awaitable:
    def __init__(self, *obj):
        self.obj = obj

    def __await__(self):
        yield self

class Task:
    def __init__(self, _task):
        self.coro = _task

    def run(self):
        while True:
            try:
                x = self.coro.send(None)
            except StopIteration as _e:
                result = _e.value
                break
            else:
                func, arg = x.obj
                func(arg)
        return result
````

Now, notice one thing: our `Task.run()` function is still blocking, and we haven't completely yielded control of our program's execution. Let's continue to modify the `Task` code.

```python
class Task:
    def __init__(self, _task):
        self.coro = _task
        self._done = False
        self._result = None

    def run(self):
        if not self._done:
            try:
                x = self.coro.send(None)
            except StopIteration as _e:
                self._result = _e.value
                self._done = True
        else:
            ...  # This should not happen, an exception should be raised


t = Task(task())
t.run()
for i in range(10):  # During sleep(2), we can do other things.
    print("doing something", i)
    sleep(0.2)
t.run()
```

We are manually scheduling multiple tasks here. In reality, we should schedule tasks automatically through an event loop (`Event Loop`).

## `Event Loop`

Firstly, tasks must have a queue. We can use a `deque` double-ended queue to store tasks.

```python
class Event:
    def __init__(self):
        self._queue = collections.deque()

    def call_soon(self, callback, *args, **kwargs):
        self._queue.append((callback, args, kwargs))
```

Next, we add scheduled tasks. Due to the special nature of scheduled tasks, we use a _heap_ to store them. Here, we leverage `heapq` for operations.

```python
class Event:
    def __init__(self):
        self._queue = collections.deque()
        self._scheduled = []

    def call_soon(self, callback, *args, **kwargs):
        self._queue.append((callback, args, kwargs))

    def call_later(self, delay, callback, *args, **kwargs):
        _t = time.time() + delay
        heapq.heappush(self._scheduled, (_t, callback, args, kwargs))
```

Let's write the event scheduling function.

```python
class Event:
    def __init__(self):
        self._queue = collections.deque()
        self._scheduled = []
        self._stopping = False

    def call_soon(self, callback, *args, **kwargs):
        self._queue.append((callback, args, kwargs))

    def call_later(self, delay, callback, *args, **kwargs):
        _t = time.time() + delay
        heapq.heappush(self._scheduled, (_t, callback, args, kwargs))

    def stop(self):
        self._stopping = True

    def run_forever(self):
        while True:
            self.run_once()  # At least one execution is necessary, so put the condition check below
            if self._stopping:
                break

    def run_once(self):
        now = time.time()
        if self._scheduled and now > self._scheduled[0][0]:
            _, cb, args, kwargs = heapq.heappop(self._scheduled)
            self._queue.append((cb, args, kwargs))

        task_num = len(self._queue)  # Prevent adding more tasks to the queue during execution
        for _ in range(task_num):
            cb, args, kwargs = self._queue.popleft()
            cb(*args, **kwargs)


t = Task(task())
loop = Event()
loop.call_soon(t.run)
loop.call_later(2, t.run)
loop.call_later(2.1, loop.stop)
loop.run_forever()

```

Now, let's modify `small_step`

```python
async def small_step():
    t1 = time.time()
    time_ = random.randint(1, 3)
    await Awaitable(time_)
    assert time.time() - t1 > time_, f"{time_} You didn't block, silly pig {time.time() - t1}"
    return time_
```

As this time has been passed to `Task`, we need to handle it in `Task`, which means adding a `loop.call_later()` while blocking.

```python
class Task:
    def __init__(self, _task):
        self.coro = _task
        self._done = False
        self._result = None

    def run(self):
        if not self._done:
            try:
                x = self.coro.send(None)
            except StopIteration as _e:
                self._result = _e.value
                self._done = True
            else:
                loop.call_later(*x.obj, self.run)
        else:
            ...  # This should not happen, an exception should be raised
```

Now, we can remove the manually specified `call_later`

```python
t = Task(task())
loop = Event()
loop.call_soon(t.run)
loop.call_later(1.1, loop.stop)  # random() will only yield values between 0 and 1
loop.run_forever()
```

Finally, let's try implementing multiple tasks and actually demonstrate the _async_ effect through some parameters.

```python
import collections
import heapq
import itertools
import random
import time
from time import sleep

count = itertools.count(0)
total = 0


async def task():
    """ Create a new task """
    print("TASK BEGIN...")

    print("     MainStep...")

    main_result = await main_step()

    print(f"     MainStep Finished with result {main_result}")

    print("TASK END")


async def main_step():
    print("         SmallStep(s)...")

    small_result = await small_step()

    print(f"         SmallStep(s) Finished with result {small_result}")

    return small_result * 100


async def small_step():
    t1 = time.time()
    time_ = random.random()
    await Awaitable(time_)
    assert time.time() - t1 > time_, f"{time_} You didn't block, silly pig {time.time() - t1}"
    return time_


class Awaitable:
    def __init__(self, *obj):
        self.obj = obj

    def __await__(self):
        yield self


class Task:
    def __init__(self, _task):
        self.coro = _task
        self._done = False
        self._result = None
        self._id = f"Task-{next(count)}"

    def run(self):
        print(f"--------- {self._id} --------")
        if not self._done:
            try:
                x = self.coro.send(None)
            except StopIteration as _e:
                self._result = _e.value
                self._done = True
            else:
                loop.call_later(*x.obj, self.run)
        else:
            ...  # This should not happen, an exception should be raised
        print("-------------------------")


class Event:
    def __init__(self):
        self._queue = collections.deque()
        self._scheduled = []
        self._stopping = False

    def call_soon(self, callback, *args, **kwargs):
        self._queue.append((callback, args, kwargs))

    def call_later(self, delay, callback, *args, **kwargs):
        _t = time.time() + delay
        global total
        total += delay
        heapq.heappush(self._scheduled, (_t, callback, args, kwargs))

    def stop(self):
        self._stopping = True

    def run_forever(self):
        while True:
            self.run_once()  # At least one execution is necessary, so put the condition check below
            if self._stopping:
                break

    def run_once(self):
        now = time.time()
        if self._scheduled and now > self._scheduled[0][0]:
            _, cb, args, kwargs = heapq.heappop(self._scheduled)
            self._queue.append((cb, args, kwargs))

        task_num = len(self._queue)  # Prevent adding more tasks to the queue during execution
        for _ in range(task_num):
            cb, args, kwargs = self._queue.popleft()
            cb(*args, **kwargs)


t = Task(task())
loop = Event()
loop.call_soon(t.run)
loop.call_later(1.1, loop.stop)
loop.run_forever()
```

Here, we can see that while we would normally need around `509.3s` to run all the tasks, thanks to the concurrent execution achieved through task scheduling, we finished running all 1000 tasks within just 1 second.

## `Future`

Finally, our code actively uses `sleep` to simulate blocking. How should we do this in a real-world scenario?

Typically, we want to perform an operation and obtain a value, as shown below:

```python
async def small_step():
    result = await Awaitable(...)
    return result
```

In this situation, we should introduce `Future`. What is a `Future`? It's a result that will happen in the future, as opposed to `Awaitable`, where we can't pass the result at the time of creation.

```python
class Future:
    def __init__(self):
        self._result = None
        self._done = False

    def set_result(self, result):
        if self._done:
            raise RuntimeError()  # Disallowed operation
        self._result = result
        self._done = True

    @property
    def result(self):
        if self._done:
            return self._result
        raise RuntimeError()

    def __await__(self):
        yield self
```

Therefore, we need something to designate when to execute `set_result`.

```python
async def small_step():
    fut = Future()
    # do something that will call set_result
    ...
    result = await fut
    return result

```

In this case, `Task` should receive this `future`, but the `future` doesn't have any information, only a flag telling us the task is not yet completed.

How does our `Task` know when to resume execution?

We can add a `callback` record in `Future` to signify this.

```python
class Future:
    def __init__(self):
        self._result = None
        self._done = False
        self._callbacks = []

    def add_done_callback(self, cb):
        self._callbacks.append(cb)

    def set_result(self, result):
        if self._done:
            raise RuntimeError()  # Disallowed operation
        self._result = result
        self._done = True

        for cb in self._callbacks:
            cb()  # May have other parameters

    @property
    def result(self):
        if self._done:
            return self._result
        raise RuntimeError()

    def __await__(self):
        yield self
        return self.result  # result = await fut will retrieve this value

class Task:
    def __init__(self, _task):
        self.coro = _task
        self._done = False
        self._result = None
        self._id = f"Task-{next(count)}"

    def run(self):
        print(f"--------- {self._id} --------")
        if not self._done:
            try:
                x = self.coro.send(None)
            except StopIteration as _e:
                self._result = _e.value
                self._done = True
            else:
                x.add_done_callback(self.run)
        else:
            ...  # This should not happen, an exception should be raised
        print("-------------------------")
```

Now, we can observe `Task` and `Future`

We can see that `Task` can simply inherit from `Future`.

```python
class Task(Future):
    def __init__(self, _task):
        super().__init__()
        self.coro = _task
        self._id = f"Task-{next(count)}"

    def run(self):
        print(f"--------- {self._id} --------")
        if not self._done:
            try:
                x = self.coro.send(None)
            except StopIteration as _e:
                self.set_result(_e.value)
            else:
                x.add_done_callback(self.run)
        else:
            ...  # This should not happen, an exception should be raised
        print("-------------------------")
```

At this point, `AsyncIO` is basically implemented. However, compared to `Python`'s own `AsyncIO`, our code could be considered very basic. It lacks in performance (since it's not written in C) and has issues in exception handling and other areas. Finally, here is the optimized code. (Didn't mention the hook-up between `Task` and `loop`, but it's written)

```python
import collections
import heapq
import itertools
import random
import threading
import time
from time import sleep

count = itertools.count(0)
blocked = 0


async def task():
    """ Create a new task """
    print("TASK BEGIN...")

    print("     MainStep...")

    main_result = await main_step()

    print(f"     MainStep Finished with result {main_result}")

    print("TASK END")


async def main_step():
    print("         SmallStep(s)...")

    small_result = await small_step()

    print(f"         SmallStep(s) Finished with result {small_result}")

    return small_result * 100


async def small_step():
    fut = Future()
    fake_io(fut)
    result = await fut
    return result


class Future:
    def __init__(self):
        self._result = None
        self._done = False
        self._callbacks = []

    def add_done_callback(self, cb):
        self._callbacks.append(cb)

    def set_result(self, result):
        if self._done:
            raise RuntimeError()  # Disallowed operation
        self._result = result
        self._done = True

        for cb in self._callbacks:
            cb()  # May have other parameters

    @property
    def result(self):
        if self._done:
            return self._result
        raise RuntimeError()

    def __await__(self):
        yield self
        return self.result


class Task(Future):
    def __init__(self, _task):
        super().__init__()
        self._loop = loop
        self.coro = _task
        self._id = f"Task-{next(count)}"
        self._loop.call_soon(self.run)
        self._start_time = time.time()

    def run(self):
        print(f"--------- {self._id} --------")
        if not self._done:
            try:
                x = self.coro.send(None)
            except StopIteration as _e:
                self.set_result(_e.value)
                global blocked
                blocked += time.time() - self._start_time
            else:
                x.add_done_callback(self.run)
        else:
            ...  # This should not happen, an exception should be raised
        print("-------------------------")


class Event:
    def __init__(self):
        self._queue = collections.deque()
        self._scheduled = []
        self._stopping = False

    def call_soon(self, callback, *args, **kwargs):
        self._queue.append((callback, args, kwargs))

    def call_later(self, delay, callback, *args, **kwargs):
        _t = time.time() + delay
        heapq.heappush(self._scheduled, (_t, callback, args, kwargs))

    def stop(self):
        self._stopping = True

    def run_forever(self):
        while True:
            self.run_once()  # At least one execution is necessary, so put the condition check below
            if self._stopping:
                break

    def run_once(self):
        now = time.time()
        if self._scheduled and now > self._scheduled[0][0] + (10 ** -5):
            _, cb, args, kwargs = heapq.heappop(self._scheduled)
            self._queue.append((cb, args, kwargs))

        task_num = len(self._queue)  # Prevent adding more tasks to the queue during execution
        for _ in range(task_num):
            cb, args, kwargs = self._queue.popleft()
            cb(*args, **kwargs)


def fake_io(fut):
    def read():
        sleep(t_ := random.random())  # IO blocking
        fut.set_result(t_)
    threading.Thread(target=read).start()


def run_until_all_task(tasks):
    if tasks := [_task for _task in tasks if not _task._done]:
        loop.call_soon(run_until_all_task, tasks)
    else:
        loop.call_soon(loop.stop)


loop = Event()
all_tasks = [Task(task()) for _ in range(1000)]
loop.call_soon(run_until_all_task, all_tasks)
t1 = time.time()
loop.run_forever()
print(time.time() - t1, blocked)

```

:::info
This Content is generated by LLM and might be wrong / incomplete, refer to Chinese version if you find something wrong.
:::

{/* AI */}

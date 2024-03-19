type CEventListener<T> = (this: any, args: T) => void

/**
	EventHandler

	This is similar to the event handler model in C#. You can subscribe or "listen" to an event to be notified when it triggered.
	Unlike addEventListener, these events don't need to be attached to elements in the DOM,

	Usage:
	```
	var onSomething = new EventHandler();
	onSomething.subscribe(function(args) {
		// This function is called when invoke is called
	})

	onSomething.invoke({ someString: "someValue" });
	```
*/
class EventHandler<T> {
	_listeners: CEventListener<T>[]
	_listenersOnce: CEventListener<T>[]
	
	constructor() {
		this._listeners = [];
		this._listenersOnce = [];
	}
	
	subscribe(listener: CEventListener<T>): void {
		this._listeners.push(listener);
	}

	subscribeOnce(listener: CEventListener<T>): void {
		this._listenersOnce.push(listener);
	}

	unsubscribe(listener: CEventListener<T>): void {
		var index = this._listeners.indexOf(listener);
		if (index != -1) {
			this._listeners.splice(index, 1);
		}
		
		var onceIndex = this._listenersOnce.indexOf(listener);
		if (onceIndex != -1) {
			this._listenersOnce.splice(onceIndex, 1)
		}
	}

	invoke(args: T): void {
		if (this._listeners) {
			for (var i = 0; i < this._listeners.length; i++) {
				this._listeners[i](args);
			}
		}

		if (this._listenersOnce) {
			for (var i = 0; i < this._listenersOnce.length; i++) {
				this._listenersOnce[i](args);
			}

			this._listenersOnce = [];
		}
	}
}

function preventDefault(e: Event) { e.preventDefault(); }
function stopPropagation(e: Event) { e.stopPropagation(); }

/**
 * This function returns a new function that can only be called once.
 * When the new function is called for the first time, it will call the "fn"
 * function with the given "context" and arguments and save the result.
 * On subsequent calls, it will return the saved result without calling "fn" again.
 */
function once<T extends (() => R), R>(fn: T, context: unknown): () => R {
	var result: R;
	
	return function (this: unknown): R {
		if (fn) {
			result = fn.apply(context || this, arguments);
			fn = context = null;
		}
		return result;
	};
}
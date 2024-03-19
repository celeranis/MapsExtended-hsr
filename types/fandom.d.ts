declare type Position = [number, number]
declare type Transform = [number, number, number]

declare namespace Fandom {
	interface IconData {
		title: string
		url: string
		height: number
		width: number
	}

	interface CategoryData {
		color: string
		icon?: IconData
		listId: number
		name: string
		symbol: string
		symbolColor: string
	}
	
	interface LinkData {
		label: string
		url: string
	}
	
	interface MarkerPopupData {
		title: string
		description: string
		descriptionHtml: string
		link?: LinkData
	}
	
	interface MarkerData {
		categoryId: string
		id: string
		popup: MarkerPopupData
		icon?: IconData
		position: Position
		config?: Config
	}
	
	interface MapOptions {
		editActionUrl?: string
		isTranscluded: boolean
		useMarkerClustering: boolean
	}

	interface MapData {
		backgroundUrl: string
		bounds: [Position, Position]
		categories: CategoryData[]
		coordinateOrder: 'xy' | 'yx'
		description?: string
		editable: boolean
		markerProgressEnabled?: boolean
		markers: MarkerData[]
		name: string
		origin: 'top-left' | 'bottom-left'
	}
}

declare type BannerNotificationType = 'notify' | 'confirm' | 'warn' | 'error'

declare class BannerNotification {
	/**
	 * Creates a new BannerNotification object.
	 * @param content Notification content. If a string, it will be interpreted as HTML. 
	 * **Make sure you're properly sanitizing what you pass to it.**
	 * If anything other than a string, it will be stringified.
	 * This means that jQuery object or Element instances will not be useful.
	 * Therefore, any events will have to be attached after construction and displaying
	 * with `.show()` using the `.$element` property as is shown later in the documentation.
	 * @param type Notification type.
	 * @param $parent The container that contains the notification. Has to be a jQuery object.
	 * @param timeout Notification display timeout in milliseconds. By default, there is no timeout.
	 */
	constructor(content: string, type: BannerNotificationType, $parent?: JQuery<HTMLElement> | null, timeout?: number)
	/**
	 * Displays the notification. If a modal is in the foreground, it will be
	 * appended on top of it unless a `$parent` was explicitly passed to the constructor.
	 */
	show(): void
	/**
	 * Hides the notification.
	 */
	hide(): void
	/**
	 * Sets the notification type. Does not update the banner's icon if `.show()`
	 * was already called on it without being hidden again. 
	 * @param type The new notification type.
	 * @deprecated It's advised not to use this method, and instead construct a new object once the type is computed.
	 */
	setType(type: BannerNotificationType): void
	/**
	 * Sets the notification content. Does not update the banner's content if `.show()`
	 * was already called on it without it being hidden again. 
	 * @param content The new notification content.
	 * @deprecated It's advised not to use this method, and instead construct a new object once the content is computed.
	 */
	setContent(content: string): void
	/**
	 * Sets a callback for when the notification is closed. There can only be one callback at a time.
	 * **It is not called if the notification expires on its own after the timeout runs out.**
	 */
	onClose(callback: () => void): void
	
	/**
	 * jQuery object for the banner. It will be null if `.show` wasn't called yet, or `.hide` was called.
	 * More specifically, it will be null when the `.hidden` property is `true`.
	 * This property is useful if you wish to attach event listeners to the banner's contents,
	 * or otherwise interact with them.
	 */
	readonly $element: JQuery<HTMLElement> | null
	/**
	 * The jQuery object passed as the parent on construction.
	 * It will not be updated with the automatically computed parent if it's not provided on construction.
	 * If none was passed on construction, it will be undefined.
	 */
	readonly $parent?: JQuery<HTMLElement>
	/**
	 * The content string. Will get updated if `.setContent` is called.
	 */
	readonly content: string
	/**
	 * The type string. Will get updated if `.setType` is called.
	 */
	readonly type: BannerNotificationType
	/**
	 * Boolean that indicates whether the banner is hidden or not.
	 * Calling `.show` will set this to false, and calling `.hide` will set this to true.
	 */
	readonly hidden: boolean
	/**
	 * The current handler for when the notification is closed.
	 * If none was passed, it will be a function that does nothing.
	 * This property can be useful if you want to set a close handler,
	 * but also want to keep a reference to the previous handler
	 * so you can call it after your new one gets executed.
	 */
	readonly onCloseHandler: () => void
}

declare interface MwApi {
	parse(content: string | MwTitle, additionalParams: Record<string, unknown>): JQuery.Promise<string>
}

declare interface MwHtml {
	element(name: keyof HTMLElementTagNameMap, attrs: Record<string, string | number>, content?: string): string
	escape(content: string): string
}

declare interface MediaWiki {
	html: MwHtml
}

declare interface JQuery {
	makeCollapsible(): void
}

declare interface Function {
	bind<T, A extends unknown[], R>(this: (...args: A) => R, obj: T): (this: T, ...args: A) => R
}

declare interface ArticleImportOpts {
	type?: 'script' | 'style'
	articles: string[]
}

declare interface MwStorage {
	setExpires(storageKey: string, expiryTime?: number): void
	get(storageKey: string): string | undefined
	set(storageKey: string, value?: string, expiryTime?: number)
}

declare function importArticles(...opts: ArticleImportOpts[]): Promise<unknown>

type ooThrottle = (<T extends unknown[]>(func: (...args: T) => void, wait: number) => (...args: T) => void)

declare interface i18n {
	useContentLang(): void
	useUserLang(): void
	inContentLang(): this
	inUserLang(): this
	inLang(code: string): this
	msg(id: string, ...args: (string | number)[]): i18nMessage
}

declare interface i18nMessage {
	exists: boolean
	plain(): string
	escape(): string
	parse(): string
}
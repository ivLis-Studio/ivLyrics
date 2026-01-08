class TabBarItem extends react.Component {
	onSelect(event) {
		event.preventDefault();
		this.props.switchTo(this.props.item.key);
	}
	onLock(event) {
		event.preventDefault();
		this.props.lockIn(this.props.item.key);
	}
	render() {
		return react.createElement(
			"li",
			{
				className: "lyrics-tabBar-headerItem",
				onClick: this.onSelect.bind(this),
				onDoubleClick: this.onLock.bind(this),
				onContextMenu: this.onLock.bind(this),
			},
			react.createElement(
				"a",
				{
					"aria-current": "page",
					className: `lyrics-tabBar-headerItemLink ${this.props.item.active ? "lyrics-tabBar-active" : ""}`,
					draggable: "false",
					href: "",
				},
				react.createElement(
					"span",
					{
						className: "main-type-mestoBold",
					},
					this.props.item.value
				)
			)
		);
	}
}

const TabBarMore = react.memo(({ items, switchTo, lockIn }) => {
	const activeItem = items.find((item) => item.active);

	function onLock(event) {
		event.preventDefault();
		if (activeItem) {
			lockIn(activeItem.key);
		}
	}
	return react.createElement(
		"li",
		{
			className: `lyrics-tabBar-headerItem ${activeItem ? "lyrics-tabBar-active" : ""}`,
			onDoubleClick: onLock,
			onContextMenu: onLock,
		},
		react.createElement(OptionsMenu, {
			options: items,
			onSelect: switchTo,
			selected: activeItem,
			defaultValue: "More",
			bold: true,
		})
	);
});

// Global ResizeObserver manager to prevent duplicate observers
const ResizeObserverManager = {
	observers: new Map(),
	callbacks: new Map(),

	observe(element, callback) {
		const elementKey = this.getElementKey(element);

		if (!this.callbacks.has(elementKey)) {
			this.callbacks.set(elementKey, new Set());
		}

		this.callbacks.get(elementKey).add(callback);

		if (!this.observers.has(elementKey)) {
			const observer = new ResizeObserver((entries) => {
				const callbacks = this.callbacks.get(elementKey);
				if (callbacks) {
					callbacks.forEach(cb => {
						try {
							cb(entries[0]);
						} catch (error) {
							// Error ignored
						}
					});
				}
			});
			this.observers.set(elementKey, observer);
			observer.observe(element);
		}

		return () => this.unobserve(element, callback);
	},

	unobserve(element, callback) {
		const elementKey = this.getElementKey(element);
		const callbacks = this.callbacks.get(elementKey);

		if (callbacks) {
			callbacks.delete(callback);

			if (callbacks.size === 0) {
				const observer = this.observers.get(elementKey);
				if (observer) {
					observer.disconnect();
					this.observers.delete(elementKey);
				}
				this.callbacks.delete(elementKey);
			}
		}
	},

	getElementKey(element) {
		// Generate a unique key for the element
		return element.className + '-' + element.tagName + '-' + (element.id || 'no-id');
	}
};

const TopBarContent = ({ links, activeLink, lockLink, switchCallback, lockCallback }) => {
	const [windowSize, setWindowSize] = useState(0);
	const cleanupRef = useRef(null);

	useEffect(() => {
		const resizeHost = document.querySelector(
			".Root__main-view .os-resize-observer-host, .Root__main-view .os-size-observer, .Root__main-view .main-view-container__scroll-node"
		);

		if (!resizeHost) return;

		const resizeHandler = (entry) => {
			const width = entry?.contentRect?.width || resizeHost.clientWidth;
			setWindowSize(width);
		};

		// Initial size
		resizeHandler({ contentRect: { width: resizeHost.clientWidth } });

		// Use global ResizeObserver manager
		cleanupRef.current = ResizeObserverManager.observe(resizeHost, resizeHandler);

		return () => {
			if (cleanupRef.current) {
				cleanupRef.current();
				cleanupRef.current = null;
			}
		};
	}, []);

	return react.createElement(
		TabBarContext,
		null,
		react.createElement(TabBar, {
			className: "queue-queueHistoryTopBar-tabBar",
			links,
			activeLink,
			lockLink,
			switchCallback,
			lockCallback,
			windowSize,
		})
	);
};

// Global container manager to prevent duplicate polling
const ContainerManager = {
	container: null,
	promise: null,
	isSearching: false,
	callbacks: new Set(),

	getContainer() {
		if (this.container) {
			return Promise.resolve(this.container);
		}

		if (this.promise) {
			return this.promise;
		}

		this.promise = this.findContainer();
		return this.promise;
	},

	findContainer() {
		return new Promise((resolve, reject) => {
			let attemptCount = 0;
			const maxAttempts = 50;

			const search = () => {
				const el = document.querySelector(".main-topBar-topbarContentWrapper");
				if (el) {
					this.container = el;
					this.promise = null;
					resolve(el);
					return;
				}

				attemptCount++;
				if (attemptCount < maxAttempts) {
					setTimeout(search, 100);
				} else {
					this.promise = null;
					reject(new Error("Container not found"));
				}
			};

			search();
		});
	},

	addCallback(callback) {
		this.callbacks.add(callback);
		this.getContainer()
			.then(container => callback(container))
			.catch(error => callback(null));
	},

	removeCallback(callback) {
		this.callbacks.delete(callback);
	}
};

const TabBarContext = ({ children }) => {
	const [container, setContainer] = useState(null);
	const [portalHost, setPortalHost] = useState(() => (window.ivLyricsEnsureReactDOM?.() || (typeof reactDOM !== "undefined" ? reactDOM : null)));
	const callbackRef = useRef(null);

	useEffect(() => {
		if (portalHost?.createPortal) {
			return;
		}

		let cancelled = false;
		let attempts = 0;
		const maxAttempts = 60;

		const checkPortalHost = () => {
			if (cancelled) return;
			const resolved = window.ivLyricsEnsureReactDOM?.() || (typeof reactDOM !== "undefined" ? reactDOM : window.Spicetify?.ReactDOM ?? window.ReactDOM ?? null);
			if (resolved?.createPortal) {
				setPortalHost(resolved);
				return;
			}
			if (attempts < maxAttempts) {
				attempts++;
				setTimeout(checkPortalHost, 50);
			}
		};

		checkPortalHost();

		return () => {
			cancelled = true;
		};
	}, [portalHost]);

	useEffect(() => {
		callbackRef.current = (foundContainer) => {
			setContainer(foundContainer);
		};

		// Add to global container manager
		ContainerManager.addCallback(callbackRef.current);

		return () => {
			if (callbackRef.current) {
				ContainerManager.removeCallback(callbackRef.current);
				callbackRef.current = null;
			}
		};
	}, []);

	if (!container || !portalHost?.createPortal) {
		return null;
	}

	return portalHost.createPortal(
		react.createElement(
			"div",
			{
				className: "main-topBar-topbarContent",
			},
			children
		),
		container
	);
};

const TabBar = react.memo(({ links, activeLink, lockLink, switchCallback, lockCallback, windowSize = Number.POSITIVE_INFINITY }) => {
	const tabBarRef = react.useRef(null);
	const [childrenSizes, setChildrenSizes] = useState([]);
	const [availableSpace, setAvailableSpace] = useState(0);
	const [droplistItem, setDroplistItems] = useState([]);

	const options = [];
	for (let i = 0; i < links.length; i++) {
		const key = links[i];
		let value = key[0].toUpperCase() + key.slice(1);
		if (key === lockLink) value = `• ${value}`;
		const active = key === activeLink;
		options.push({ key, value, active });
	}

	useEffect(() => {
		if (!tabBarRef.current) return;
		setAvailableSpace(tabBarRef.current.clientWidth);
	}, [windowSize]);

	useEffect(() => {
		if (!tabBarRef.current) return;

		const tabbarItemSizes = [];
		for (const child of tabBarRef.current.children) {
			tabbarItemSizes.push(child.clientWidth);
		}

		setChildrenSizes(tabbarItemSizes);
	}, [links]);

	useEffect(() => {
		if (!tabBarRef.current) return;

		const totalSize = childrenSizes.reduce((a, b) => a + b, 0);

		// Can we render everything?
		if (totalSize <= availableSpace) {
			setDroplistItems([]);
			return;
		}

		// The `More` button can be set to _any_ of the children. So we
		// reserve space for the largest item instead of always taking
		// the last item.
		const viewMoreButtonSize = Math.max(...childrenSizes);

		// Figure out how many children we can render while also showing
		// the More button
		const itemsToHide = [];
		let stopWidth = viewMoreButtonSize;

		childrenSizes.forEach((childWidth, i) => {
			if (availableSpace >= stopWidth + childWidth) {
				stopWidth += childWidth;
			} else {
				// First elem is edit button
				itemsToHide.push(i);
			}
		});

		setDroplistItems(itemsToHide);
	}, [availableSpace, childrenSizes]);

	return react.createElement(
		"nav",
		{
			className: "lyrics-tabBar lyrics-tabBar-nav",
		},
		react.createElement(
			"ul",
			{
				className: "lyrics-tabBar-header",
				ref: tabBarRef,
			},
			react.createElement("li", {
				className: "lyrics-tabBar-headerItem",
			}),
			...options
				.filter((_, id) => !droplistItem.includes(id))
				.map((item) =>
					react.createElement(TabBarItem, {
						key: item.key,
						item,
						switchTo: switchCallback,
						lockIn: lockCallback,
					})
				),
			droplistItem.length || childrenSizes.length === 0
				? react.createElement(TabBarMore, {
					items: droplistItem.map((i) => options[i]).filter(Boolean),
					switchTo: switchCallback,
					lockIn: lockCallback,
				})
				: null
		)
	);
});

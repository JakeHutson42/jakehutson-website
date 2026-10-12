// Both the lobby guide and pause-menu guide use the same accessible tab behaviour.
// Choose touch instructions initially on phones; users can always switch devices.
export function initialiseDrivingGuides(root = document) {
    root.querySelectorAll('[data-guide]').forEach(guide => {
        const tabs = [...guide.querySelectorAll('[data-guide-tab]')];
        const selectTab = selected => {
            tabs.forEach(tab => {
                const active = tab === selected;
                tab.setAttribute('aria-selected', String(active));
                tab.tabIndex = active ? 0 : -1;
            });
            guide.querySelectorAll('[data-guide-panel]').forEach(panel => {
                panel.hidden = panel.dataset.guidePanel !== selected.dataset.guideTab;
            });
        };
        tabs.forEach((tab, index) => {
            tab.addEventListener('click', () => selectTab(tab));
            tab.addEventListener('keydown', event => {
                let next;
                if (event.key === 'ArrowRight') next = tabs[(index + 1) % tabs.length];
                else if (event.key === 'ArrowLeft') next = tabs[(index + tabs.length - 1) % tabs.length];
                else if (event.key === 'Home') next = tabs[0];
                else if (event.key === 'End') next = tabs.at(-1);
                if (!next) return;
                event.preventDefault(); selectTab(next); next.focus();
            });
        });
        selectTab(tabs[window.matchMedia('(any-pointer: coarse), (max-width: 760px)').matches ? 1 : 0]);
    });
}

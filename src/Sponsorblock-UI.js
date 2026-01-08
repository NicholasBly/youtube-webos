const sponsorBlockIcon = 'https://raw.githubusercontent.com/NicholasBly/youtube-webos/refs/heads/main/src/icons/IconSponsorBlocker64px.png';

const STYLES = `
    /* --- Popup Styles --- */
    .sb-segments-popup {
        position: fixed;
        top: 5%;
        right: 5%;
        bottom: auto;
        left: auto;
        transform: none;
        
        background-color: #000000;
        border: 1px solid red;
        border-radius: 16px;
        padding: 20px;
        
        width: 750px;
        max-height: 85vh;
        overflow-y: auto;
        
        z-index: 9999;
        display: none;
        color: #eee;
        font-family: Roboto, Arial, sans-serif;
        box-shadow: 0 10px 30px rgba(0,0,0,0.8);
    }
    
    .sb-segments-popup.visible {
        display: block;
    }

    .sb-popup-header {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding-bottom: 15px;
        margin-bottom: 15px;
        border-bottom: 1px solid rgba(255,255,255,0.1);
        text-align: center;
    }

    .sb-header-title-row {
        display: flex;
        align-items: center;
        margin-bottom: 5px;
    }

    .sb-header-icon {
        width: 32px;
        height: 32px;
        fill: #ff0000;
        margin-right: 10px;
    }

    .sb-header-text {
        font-size: 48px;
        font-weight: 700;
        color: #fff;
    }

    .sb-header-subtitle {
        font-size: 28px;
        color: #aaa;
    }

    .sb-segment-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 10px 12px;
        border-radius: 6px;
        margin-bottom: 4px;
        background: transparent;
        transition: background-color 0.2s;
    }

    .sb-row-left {
        display: flex;
        align-items: center;
    }

    .sb-segment-dot {
        width: 10px;
        height: 10px;
        border-radius: 50%;
        flex-shrink: 0;
        margin-right: 12px;
    }

    .sb-segment-category {
        font-weight: 600;
        font-size: 32px;
        color: #e0e0e0;
    }

    .sb-segment-time {
        font-size: 32px;
        font-family: "Roboto Mono", monospace;
        color: #fff;
        font-weight: 500;
    }

    .sb-segments-popup:focus {
        outline: none;
        border-color: #fff;
    }

    .sb-segment-row:focus {
        background-color: #fff;
        outline: none;
    }
    
    .sb-segment-row:focus .sb-segment-category,
    .sb-segment-row:focus .sb-segment-time {
        color: #000;
    }
`;

class SponsorBlockUI {
    constructor() {
        this.popup = null;
        this.visible = false;
		this.hasSegments = false;
        this.injectStyles();
    }

    injectStyles() {
        if (!document.getElementById('sb-ui-styles')) {
            const style = document.createElement('style');
            style.id = 'sb-ui-styles';
            style.textContent = STYLES;
            document.head.appendChild(style);
        }
    }

    formatTime(seconds) {
        const date = new Date(0);
        date.setSeconds(seconds);
        const timeStr = date.toISOString().substr(11, 8);
        return timeStr.startsWith('00:') ? timeStr.slice(3) : timeStr;
    }

    getSegmentColor(category) {
        const colors = {
            sponsor: '#00d400',
            intro: '#00ffff',
            outro: '#0202ed',
            interaction: '#cc00ff',
            selfpromo: '#ffff00',
            music_offtopic: '#ff9900',
            preview: '#008fd6',
            poi: '#ff1684',
            filler: '#7300FF',
            poi_highlight: '#ff1684',
			hook: '#395699'
        };
        return colors[category] || '#777';
    }

    getCategoryName(category) {
        const names = {
            sponsor: 'Sponsor',
            intro: 'Intermission/Intro',
            outro: 'Endcards/Credits',
            interaction: 'Interaction',
            selfpromo: 'Unpaid/Self Promotion',
            music_offtopic: 'Non-Music Section',
            preview: 'Preview/Recap',
            poi: 'Highlight',
            poi_highlight: 'Highlight',
            filler: 'Filler/Tangents'
        };
        return names[category] || category.charAt(0).toUpperCase() + category.slice(1);
    }

    createPopup() {
        if (this.popup) return this.popup;

        const popup = document.createElement('div');
        popup.className = 'sb-segments-popup';
        popup.setAttribute('tabindex', '-1'); 
        
        popup.innerHTML = `
            <div class="sb-popup-header">
                <div class="sb-header-title-row">
                    <img class="sb-header-icon" src="${sponsorBlockIcon}" alt="SponsorBlock">
                    <span class="sb-header-text">SponsorBlock</span>
                </div>
                <div class="sb-header-subtitle">This video has segments in the database!</div>
            </div>
            <div class="sb-list-container"></div>
        `;
        document.body.appendChild(popup);
        this.popup = popup;

        return popup;
    }

    updateSegments(segments) {
        if (!this.popup) this.createPopup();
        const container = this.popup.querySelector('.sb-list-container');
        container.innerHTML = '';
		
        this.hasSegments = segments && segments.length > 0;
        if (!this.hasSegments) {
            this.popup.classList.remove('visible');
			return;
		}

        // Sort segments chronologically by start time
        const sortedSegments = [...segments].sort((a, b) => a.segment[0] - b.segment[0]);

        sortedSegments.forEach(segment => {
            const row = document.createElement('div');
            row.className = 'sb-segment-row';
            row.setAttribute('tabindex', '-1'); 
            
            const color = this.getSegmentColor(segment.category);
            const startTime = this.formatTime(segment.segment[0]);
            const endTime = this.formatTime(segment.segment[1]);
            const categoryName = this.getCategoryName(segment.category);

            // Handle Highlights specifically (single timestamp vs range)
            let timeLabel;
            if (segment.category === 'poi_highlight' || segment.category === 'poi') {
                timeLabel = startTime;
            } else {
                timeLabel = `${startTime} to ${endTime}`;
            }

            row.innerHTML = `
                <div class="sb-row-left">
                    <div class="sb-segment-dot" style="background-color: ${color}"></div>
                    <span class="sb-segment-category">${categoryName}</span>
                </div>
                <span class="sb-segment-time">${timeLabel}</span>
            `;
            container.appendChild(row);
        });
			if (this.visible) {
				this.popup.classList.add('visible');
			}
    }

    togglePopup(visible) {
        if (!this.popup) this.createPopup();
        this.visible = visible;
        
        if (this.visible && this.hasSegments) {
            this.popup.classList.add('visible');
        } else {
            this.popup.classList.remove('visible');
        }
    }
}

export default new SponsorBlockUI();
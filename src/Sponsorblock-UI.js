import './sponsorblock-ui.css';

const sponsorBlockIcon = 'https://raw.githubusercontent.com/NicholasBly/youtube-webos/refs/heads/main/src/icons/IconSponsorBlocker64px.png';

class SponsorBlockUI {
    constructor() {
        this.popup = null;
        this.visible = false;
		this.hasSegments = false;
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
            musicofftopic: '#ff9900',
            preview: '#008fd6',
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
            musicofftopic: 'Non-Music Section',
            preview: 'Preview/Recap',
            poi_highlight: 'Highlight',
            filler: 'Filler/Tangents',
            hook: 'Hook/Greetings'
        };
        return names[category] || category.charAt(0).toUpperCase() + category.slice(1);
    }

    createPopup() {
        if (this.popup) return this.popup;

        const popup = document.createElement('div');
        popup.className = 'sb-segments-popup';
        popup.setAttribute('tabindex', '-1'); 
        
        const header = document.createElement('div');
        header.className = 'sb-popup-header';
        
        const titleRow = document.createElement('div');
        titleRow.className = 'sb-header-title-row';
        
        const icon = document.createElement('img');
        icon.className = 'sb-header-icon';
        icon.src = sponsorBlockIcon;
        icon.alt = 'SponsorBlock';
        
        const titleText = document.createElement('span');
        titleText.className = 'sb-header-text';
        titleText.textContent = 'SponsorBlock';
        
        titleRow.appendChild(icon);
        titleRow.appendChild(titleText);
        
        const subtitle = document.createElement('div');
        subtitle.className = 'sb-header-subtitle';
        subtitle.textContent = 'This video has segments in the database!';
        
        header.appendChild(titleRow);
        header.appendChild(subtitle);
        
        const listContainer = document.createElement('div');
        listContainer.className = 'sb-list-container';
        
        popup.appendChild(header);
        popup.appendChild(listContainer);
        document.body.appendChild(popup);
        this.popup = popup;

        return popup;
    }

    updateSegments(segments) {
        if (!this.popup) this.createPopup();
        const container = this.popup.querySelector('.sb-list-container');
        container.textContent = '';
		
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

            const leftRow = document.createElement('div');
            leftRow.className = 'sb-row-left';

            const dot = document.createElement('div');
            dot.className = 'sb-segment-dot';
            dot.style.backgroundColor = color;

            const categorySpan = document.createElement('span');
            categorySpan.className = 'sb-segment-category';
            categorySpan.textContent = categoryName;

            leftRow.appendChild(dot);
            leftRow.appendChild(categorySpan);

            const timeSpan = document.createElement('span');
            timeSpan.className = 'sb-segment-time';
            timeSpan.textContent = timeLabel;

            row.appendChild(leftRow);
            row.appendChild(timeSpan);
            
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
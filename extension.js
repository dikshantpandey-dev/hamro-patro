import Gio from 'gi://Gio';
import GObject from 'gi://GObject';
import GLib from 'gi://GLib';
import St from 'gi://St';
import Clutter from 'gi://Clutter';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import {
  Extension,
  gettext as _,
} from 'resource:///org/gnome/shell/extensions/extension.js';

import {
  formatNepaliDateData,
  getCurrentNepaliDate,
  preloadYearData,
  NEPALI_MONTHS,
  NEPALI_WEEKDAYS_SHORT,
  FIRST_SUPPORTED_YEAR,
  LAST_SUPPORTED_YEAR,
  getDaysInNepaliMonth,
  nepaliToEnglishDate,
  getNepaliMonthDays,
} from './utils/NepaliDateConverter.js';
import { convertToNepaliNumber } from './utils/Helper.js';

const EN_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const hasEvent = (ev) => ev && ev !== '-' && ev !== '--' && ev.trim().length > 0;

const HAMRO_PATRO_CMD = 'google-chrome --app=https://www.hamropatro.com/widgets/ext/patro/np --window-size=440,650';

const Indicator = GObject.registerClass(
  class Indicator extends PanelMenu.Button {
    _init(extensionPath) {
      super._init(0.0, 'Hamro Patro');
      this._extensionPath = extensionPath;
      this._updateTimeout = null;
      this._dailyUpdateTimeout = null;

      // Clean macOS-style panel capsule button
      this._box = new St.BoxLayout({
        style_class: 'hp-panel-pill',
        y_align: Clutter.ActorAlign.CENTER,
      });

      this._panelIcon = null;
      try {
        const iconFile = Gio.File.new_for_path(this._extensionPath + '/hamropatro.png');
        if (iconFile.query_exists(null)) {
          this._panelIcon = new St.Icon({
            gicon: new Gio.FileIcon({ file: iconFile }),
            icon_size: 16,
            style_class: 'hp-panel-icon',
            y_align: Clutter.ActorAlign.CENTER,
          });
          this._box.add_child(this._panelIcon);
        }
      } catch (_) {}

      this._nepaliDateLabel = new St.Label({
        text: '',
        y_align: Clutter.ActorAlign.CENTER,
        style_class: 'hp-panel-date-text',
      });
      this._box.add_child(this._nepaliDateLabel);
      this.add_child(this._box);

      this._createPopupMenu();
      this._updateLabel();
    }

    _createPopupMenu() {
      // Main Glassmorphic Widget Card
      const cardContainer = new St.BoxLayout({
        vertical: true,
        style_class: 'hp-widget-card',
      });

      // 1. Header Bar: [Icon + Brand Name] ... [B.S. Year Badge]
      const headerBox = new St.BoxLayout({
        style_class: 'hp-card-header',
        y_align: Clutter.ActorAlign.CENTER,
      });

      const brandBox = new St.BoxLayout({
        style_class: 'hp-brand-box',
        y_align: Clutter.ActorAlign.CENTER,
      });

      try {
        const iconFile = Gio.File.new_for_path(this._extensionPath + '/hamropatro.png');
        if (iconFile.query_exists(null)) {
          const brandIcon = new St.Icon({
            gicon: new Gio.FileIcon({ file: iconFile }),
            icon_size: 22,
            style_class: 'hp-brand-icon',
            y_align: Clutter.ActorAlign.CENTER,
          });
          brandBox.add_child(brandIcon);
        }
      } catch (_) {}

      const brandTitle = new St.Label({
        text: 'हाम्रो पात्रो',
        y_align: Clutter.ActorAlign.CENTER,
        style_class: 'hp-brand-title',
      });
      brandBox.add_child(brandTitle);
      headerBox.add_child(brandBox);

      this._yearBadge = new St.Label({
        text: 'वि.सं. २०८३',
        y_align: Clutter.ActorAlign.CENTER,
        x_align: Clutter.ActorAlign.END,
        x_expand: true,
        style_class: 'hp-year-badge',
      });
      headerBox.add_child(this._yearBadge);
      cardContainer.add_child(headerBox);

      // 2. Hero Row: [Calendar Date Tile] + [Tithi & English Date Column]
      const heroRow = new St.BoxLayout({
        style_class: 'hp-hero-row',
        y_align: Clutter.ActorAlign.CENTER,
      });

      // Calendar Tile (Apple Calendar style)
      const dateTile = new St.BoxLayout({
        vertical: true,
        style_class: 'hp-date-tile',
      });

      this._monthHeader = new St.Label({
        text: 'असोज',
        style_class: 'hp-tile-month',
      });
      this._dayNumber = new St.Label({
        text: '१०',
        style_class: 'hp-tile-number',
      });
      this._weekdayLabel = new St.Label({
        text: 'शनिबार',
        style_class: 'hp-tile-weekday',
      });

      dateTile.add_child(this._monthHeader);
      dateTile.add_child(this._dayNumber);
      dateTile.add_child(this._weekdayLabel);
      heroRow.add_child(dateTile);

      // Details Column
      const detailsCol = new St.BoxLayout({
        vertical: true,
        x_expand: true,
        style_class: 'hp-details-col',
      });

      this._tithiBadge = new St.Label({
        text: '🌕 पूर्णिमा तिथी',
        style_class: 'hp-tithi-pill',
      });
      this._englishDateLabel = new St.Label({
        text: 'Sep 26, 2026',
        style_class: 'hp-english-date',
      });
      detailsCol.add_child(this._tithiBadge);
      detailsCol.add_child(this._englishDateLabel);
      heroRow.add_child(detailsCol);

      cardContainer.add_child(heroRow);

      // 2b. Full month calendar
      cardContainer.add_child(this._buildCalendar());

      // 3. Today's Events / Festivals Card
      this._eventCard = new St.BoxLayout({
        vertical: true,
        style_class: 'hp-event-card',
      });

      this._eventHeader = new St.Label({
        text: '✨ आजको चाडपर्व तथा विशेष',
        style_class: 'hp-event-header',
      });
      this._eventText = new St.Label({
        text: '--',
        style_class: 'hp-event-text',
      });
      this._eventText.clutter_text.line_wrap = true;

      this._eventCard.add_child(this._eventHeader);
      this._eventCard.add_child(this._eventText);
      cardContainer.add_child(this._eventCard);

      // 4. Quick Action Button: Open Hamro Patro App
      const actionBtn = new St.Button({
        style_class: 'hp-launch-button',
        can_focus: true,
        reactive: true,
        x_align: Clutter.ActorAlign.FILL,
      });

      const btnBox = new St.BoxLayout({
        style_class: 'hp-btn-box',
        x_align: Clutter.ActorAlign.CENTER,
      });

      const btnLabel = new St.Label({
        text: 'हाम्रो पात्रो खोल्नुहोस् ↗',
        style_class: 'hp-btn-label',
      });
      btnBox.add_child(btnLabel);
      actionBtn.set_child(btnBox);

      actionBtn.connect('clicked', () => {
        this.menu.close();
        GLib.spawn_command_line_async(HAMRO_PATRO_CMD);
      });

      cardContainer.add_child(actionBtn);

      // Wrap in PopupBaseMenuItem
      const customItem = new PopupMenu.PopupBaseMenuItem({
        reactive: false,
        style_class: 'hp-popup-item-wrapper',
      });
      customItem.actor.add_child(cardContainer);
      this.menu.addMenuItem(customItem);

      // Every time the popup opens, jump back to today's month.
      this.menu.connect('open-state-changed', (_menu, open) => {
        if (open) this._showToday();
      });
    }

    // ---------------------------------------------------------------------
    // Full month calendar
    // ---------------------------------------------------------------------

    _buildCalendar() {
      const box = new St.BoxLayout({ vertical: true, style_class: 'hp-cal' });

      // Navigation: ‹  असोज २०८३ · Sep/Oct 2026  ›   [आज]
      const nav = new St.BoxLayout({ style_class: 'hp-cal-nav' });
      this._prevBtn = new St.Button({ label: '‹', style_class: 'hp-cal-arrow', can_focus: true });
      this._nextBtn = new St.Button({ label: '›', style_class: 'hp-cal-arrow', can_focus: true });
      this._prevBtn.connect('clicked', () => this._shiftMonth(-1));
      this._nextBtn.connect('clicked', () => this._shiftMonth(1));

      const titleCol = new St.BoxLayout({
        vertical: true, x_expand: true, x_align: Clutter.ActorAlign.CENTER,
      });
      this._calTitle = new St.Label({ style_class: 'hp-cal-title', x_align: Clutter.ActorAlign.CENTER });
      this._calSubtitle = new St.Label({ style_class: 'hp-cal-subtitle', x_align: Clutter.ActorAlign.CENTER });
      titleCol.add_child(this._calTitle);
      titleCol.add_child(this._calSubtitle);

      this._todayBtn = new St.Button({ label: 'आज', style_class: 'hp-cal-today-btn', can_focus: true });
      this._todayBtn.connect('clicked', () => this._showToday());

      nav.add_child(this._prevBtn);
      nav.add_child(titleCol);
      nav.add_child(this._nextBtn);
      nav.add_child(this._todayBtn);
      box.add_child(nav);

      // Grid: 1 weekday header row + up to 6 week rows.
      this._gridLayout = new Clutter.GridLayout({
        column_homogeneous: true,
        row_homogeneous: false,
      });
      this._grid = new St.Widget({ layout_manager: this._gridLayout, style_class: 'hp-cal-grid' });
      box.add_child(this._grid);

      return box;
    }

    _showToday() {
      const t = getCurrentNepaliDate();
      this._today = { y: t.nepaliYear, m: t.nepaliMonth, d: t.nepaliDay };
      this._viewYear = t.nepaliYear;
      this._viewMonth = t.nepaliMonth;
      this._selected = { ...this._today };
      this._renderCalendar();
      this._showDayDetails(this._selected);
    }

    _shiftMonth(delta) {
      let y = this._viewYear;
      let m = this._viewMonth + delta;
      if (m < 1) { m = 12; y--; }
      if (m > 12) { m = 1; y++; }
      if (y < FIRST_SUPPORTED_YEAR || y > LAST_SUPPORTED_YEAR) return;
      this._viewYear = y;
      this._viewMonth = m;
      this._renderCalendar();
    }

    _renderCalendar() {
      const y = this._viewYear;
      const m = this._viewMonth;
      const daysInMonth = getDaysInNepaliMonth(y, m);
      const records = getNepaliMonthDays(y, m);
      const first = nepaliToEnglishDate(y, m, 1);
      const last = nepaliToEnglishDate(y, m, daysInMonth);
      const startCol = first.getDay(); // 0 = Sunday (आइतबार)

      this._calTitle.set_text(`${NEPALI_MONTHS[m - 1]} ${convertToNepaliNumber(y)}`);
      const enSpan = first.getMonth() === last.getMonth()
        ? `${EN_MONTHS[first.getMonth()]} ${first.getFullYear()}`
        : first.getFullYear() === last.getFullYear()
          ? `${EN_MONTHS[first.getMonth()]}/${EN_MONTHS[last.getMonth()]} ${last.getFullYear()}`
          : `${EN_MONTHS[first.getMonth()]} ${first.getFullYear()}/${EN_MONTHS[last.getMonth()]} ${last.getFullYear()}`;
      this._calSubtitle.set_text(enSpan);

      const atStart = y === FIRST_SUPPORTED_YEAR && m === 1;
      const atEnd = y === LAST_SUPPORTED_YEAR && m === 12;
      this._prevBtn.reactive = !atStart;
      this._nextBtn.reactive = !atEnd;
      this._prevBtn.opacity = atStart ? 80 : 255;
      this._nextBtn.opacity = atEnd ? 80 : 255;

      this._grid.destroy_all_children();

      NEPALI_WEEKDAYS_SHORT.forEach((name, col) => {
        const hdr = new St.Label({
          text: name,
          style_class: col === 6 ? 'hp-cal-weekday hp-cal-sat' : 'hp-cal-weekday',
          x_align: Clutter.ActorAlign.CENTER,
        });
        this._gridLayout.attach(hdr, col, 0, 1, 1);
      });

      for (let d = 1; d <= daysInMonth; d++) {
        const idx = startCol + d - 1;
        const col = idx % 7;
        const row = 1 + Math.floor(idx / 7);
        const rec = records[d - 1] ?? {};
        const enDay = rec.en ?? String(nepaliToEnglishDate(y, m, d).getDate());

        const isToday = this._today && y === this._today.y && m === this._today.m && d === this._today.d;
        const isSelected = this._selected && y === this._selected.y && m === this._selected.m && d === this._selected.d;
        const isHoliday = col === 6 || rec.isHoliday === true;

        const classes = ['hp-cal-day'];
        if (isHoliday) classes.push('hp-cal-holiday');
        if (isSelected && !isToday) classes.push('hp-cal-selected');
        if (isToday) classes.push('hp-cal-today');

        const cell = new St.BoxLayout({ vertical: true, x_align: Clutter.ActorAlign.CENTER });
        cell.add_child(new St.Label({
          text: convertToNepaliNumber(d), style_class: 'hp-cal-np', x_align: Clutter.ActorAlign.CENTER,
        }));
        const bottom = new St.BoxLayout({ x_align: Clutter.ActorAlign.CENTER });
        bottom.add_child(new St.Label({ text: enDay, style_class: 'hp-cal-en' }));
        if (hasEvent(rec.event))
          bottom.add_child(new St.Label({ text: '•', style_class: 'hp-cal-dot' }));
        cell.add_child(bottom);

        const btn = new St.Button({
          style_class: classes.join(' '),
          child: cell,
          can_focus: true,
          x_expand: true,
        });
        btn.connect('clicked', () => {
          this._selected = { y, m, d };
          this._renderCalendar();
          this._showDayDetails(this._selected);
        });
        this._gridLayout.attach(btn, col, row, 1, 1);
      }
    }

    _showDayDetails({ y, m, d }) {
      const rec = getNepaliMonthDays(y, m)[d - 1] ?? {};
      const isToday = this._today && y === this._today.y && m === this._today.m && d === this._today.d;
      const ad = nepaliToEnglishDate(y, m, d);
      const adText = `${EN_MONTHS[ad.getMonth()]} ${ad.getDate()}, ${ad.getFullYear()}`;
      const tithi = rec.tithi && rec.tithi !== '-' ? ` · ${rec.tithi}` : '';

      this._eventHeader.set_text(isToday
        ? `✨ आज${tithi} · ${adText}`
        : `📅 ${convertToNepaliNumber(d)} ${NEPALI_MONTHS[m - 1]}${tithi} · ${adText}`);

      if (hasEvent(rec.event)) {
        this._eventText.set_text(rec.event.split('/').map((e) => e.trim()).join('\n'));
      } else {
        this._eventText.set_text(rec.isHoliday ? 'सार्वजनिक बिदा' : 'कुनै विशेष पर्व छैन');
      }
      this._eventCard.show();
    }

    _updateLabel() {
      const nepaliDateInfo = formatNepaliDateData(getCurrentNepaliDate());
      if (nepaliDateInfo) {
        // Top bar text: e.g. "१० असोज • पूर्णिमा"
        const tithiShort = nepaliDateInfo.nepaliTithi ? ` • ${nepaliDateInfo.nepaliTithi}` : '';
        this._nepaliDateLabel.set_text(
          `${nepaliDateInfo.nepaliDay} ${nepaliDateInfo.nepaliMonth}${tithiShort}`
        );

        this._yearBadge.set_text(`वि.सं. ${nepaliDateInfo.nepaliYear}`);
        this._monthHeader.set_text(nepaliDateInfo.nepaliMonth);
        this._dayNumber.set_text(nepaliDateInfo.nepaliDay);
        this._weekdayLabel.set_text(nepaliDateInfo.nepaliDayOfWeek);
        this._englishDateLabel.set_text(nepaliDateInfo.englishDate);
        this._tithiBadge.set_text(`🌕 ${nepaliDateInfo.nepaliTithi}`);
      }

      // Refresh the calendar/today highlight (e.g. after midnight).
      if (this._grid) this._showToday();

      this._scheduleMidnightUpdate();
    }

    _scheduleMidnightUpdate() {
      const SECONDS_PER_DAY = 86400;
      const now = new Date();
      const midnight = new Date();
      midnight.setHours(24, 0, 0, 0);
      const timeUntilMidnight = (midnight - now) / 1000;

      if (this._updateTimeout) {
        GLib.source_remove(this._updateTimeout);
      }
      try {
        this._updateTimeout = GLib.timeout_add_seconds(
          GLib.PRIORITY_DEFAULT,
          timeUntilMidnight,
          () => {
            this._updateLabel();
            this._dailyUpdateTimeout = GLib.timeout_add_seconds(
              GLib.PRIORITY_DEFAULT,
              SECONDS_PER_DAY,
              () => {
                this._updateLabel();
                return GLib.SOURCE_CONTINUE;
              }
            );
            return GLib.SOURCE_REMOVE;
          }
        );
      } catch (error) {
        console.error('Failed to setup update timer:', error);
      }
    }

    destroy() {
      if (this._updateTimeout) {
        GLib.source_remove(this._updateTimeout);
        this._updateTimeout = null;
      }

      if (this._dailyUpdateTimeout) {
        GLib.source_remove(this._dailyUpdateTimeout);
        this._dailyUpdateTimeout = null;
      }

      super.destroy();
    }
  }
);

export default class HamroPatro extends Extension {
  constructor(metadata) {
    super(metadata);
    this._extension = null;
    this._positionChangedId = null;
    this._dateMenuItem = null;
    this._dateMenuSeparator = null;
  }

  enable() {
    this._settings = this.getSettings();
    const position = this._settings.get_string('menu-position');

    preloadYearData(this.path).then(() => {
      this._extension = new Indicator(this.path);
      this._addToPanel(position);
    }).catch(err => {
      console.error('Failed to preloadYearData:', err);
    });

    this._positionChangedId = this._settings.connect(
      'changed::menu-position',
      () => {
        const newPosition = this._settings.get_string('menu-position');
        this._moveIndicator(newPosition);
      }
    );
  }

  disable() {
    if (this._positionChangedId) {
      this._settings.disconnect(this._positionChangedId);
      this._positionChangedId = null;
    }

    if (this._settings) {
      this._settings = null;
    }

    this._removeFromDateMenu();

    if (this._extension) {
      this._removeFromPanel();
      this._extension.destroy();
      this._extension = null;
    }
  }

  _moveIndicator(newPosition) {
    if (!this._extension) {
      return;
    }
    this._removeFromPanel();
    this._addToPanel(newPosition);
  }

  _removeFromPanel() {
    if (!this._extension) {
      return;
    }
    const { container, menu } = this._extension;
    container?.get_parent()?.remove_child(container);
    Main.panel.menuManager.removeMenu(menu);
  }

  _removeFromDateMenu() {
    if (this._dateMenuItem) {
      this._dateMenuItem.destroy();
      this._dateMenuItem = null;
    }
    if (this._dateMenuSeparator) {
      this._dateMenuSeparator.destroy();
      this._dateMenuSeparator = null;
    }
  }

  _addToPanel(position) {
    const positionMap = {
      left: Main.panel._leftBox,
      center: Main.panel._centerBox,
      right: Main.panel._rightBox,
    };

    const panelPosition = positionMap[position] || Main.panel._centerBox;
    panelPosition.insert_child_at_index(this._extension.container, -1);
    Main.panel.menuManager.addMenu(this._extension.menu);

    // Also add option inside native GNOME Date & Time menu
    try {
      const dateMenu = Main.panel.statusArea?.dateMenu;
      if (dateMenu && dateMenu.menu) {
        this._removeFromDateMenu();
        this._dateMenuSeparator = new PopupMenu.PopupSeparatorMenuItem();
        
        let labelText = '🇳🇵 हाम्रो पात्रो (Hamro Patro)';
        try {
          const info = formatNepaliDateData(getCurrentNepaliDate());
          if (info) {
            labelText = `🇳🇵 हाम्रो पात्रो — ${info.nepaliDay} ${info.nepaliMonth} ${info.nepaliYear} (${info.nepaliTithi})`;
          }
        } catch (_) {}

        this._dateMenuItem = new PopupMenu.PopupMenuItem(labelText);
        this._dateMenuItem.label.add_style_class_name('hp-nepali');
        this._dateMenuItem.connect('activate', () => {
          GLib.spawn_command_line_async(HAMRO_PATRO_CMD);
        });
        
        dateMenu.menu.addMenuItem(this._dateMenuSeparator);
        dateMenu.menu.addMenuItem(this._dateMenuItem);
      }
    } catch (e) {
      console.error('Failed to add Hamro Patro to dateMenu:', e);
    }
  }
}

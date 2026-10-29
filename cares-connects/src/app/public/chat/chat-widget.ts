import { Component, ElementRef, PLATFORM_ID, computed, inject, signal, viewChild } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { rxResource } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { Api } from '../../core/api';
import { mapsUrl, telHref } from '../contact-links';
import { type CountyRef, type PublicResource, serviceAreaLabel } from '../../../shared/api-types';
import { Brain } from './brain';
import { FOLLOW_UPS, type FollowUpOption, GENERIC_FOLLOW_UP, isCrisis, parseBrain, parseYesNo } from './chat-flows';

type Step = 'ca' | 'location' | 'need' | 'followup' | 'done';

interface Message {
  id: number;
  from: 'bot' | 'user';
  text?: string;
  crisis?: boolean;
  results?: { items: PublicResource[]; total: number; categorySlug: string; countySlug: string };
}

interface Reply {
  label: string;
  run?: () => void;
  /** Render as a link (phone, text) instead of a button. */
  href?: string;
}

/** Need buttons shown first; the rest are reachable by typing or "Something else". */
const FEATURED_NEEDS = [
  'food', 'shelter-and-housing', 'medical-and-dental-health', 'mental-health', 'financial-aid',
  'job-assistance', 'legal', 'transportation',
];
const RESULT_LIMIT = 5;

/**
 * "Find help" chat: a guided, deterministic conversation.
 *   California? → ZIP / city / county → need → one follow-up → listings.
 * Crisis rules run on every message first. The brain model only interprets free text
 * (which need, or an FAQ answer); listings always come from the live directory.
 * Nothing is stored: the conversation lives only in this component.
 */
@Component({
  selector: 'app-chat-widget',
  imports: [RouterLink],
  templateUrl: './chat-widget.html',
  styleUrl: './chat-widget.scss',
})
export class ChatWidget {
  private readonly api = inject(Api);
  private readonly brain = inject(Brain);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly log = viewChild<ElementRef<HTMLElement>>('log');
  private readonly input = viewChild<ElementRef<HTMLInputElement>>('input');
  private readonly launcher = viewChild<ElementRef<HTMLButtonElement>>('launcher');

  readonly open = signal(false);
  readonly messages = signal<Message[]>([]);
  readonly replies = signal<Reply[]>([]);
  readonly typing = signal(false);
  readonly draft = signal('');

  private step: Step = 'ca';
  private county: CountyRef | null = null;
  private countyLabel = '';
  private need: string | null = null;
  private nextId = 1;

  private readonly categories = rxResource({ stream: () => this.api.categories() });
  /** Counties with listings; the busiest ones become quick-pick bubbles, so new areas appear on their own. */
  private readonly counties = rxResource({ stream: () => this.api.counties() });
  private readonly categoryName = computed(() => new Map((this.categories.value() ?? []).map((c) => [c.slug, c.name])));

  readonly serviceArea = serviceAreaLabel;
  readonly tel = telHref;
  readonly maps = mapsUrl;

  toggle(): void {
    if (this.open()) return this.close();
    this.open.set(true);
    if (!this.messages().length) this.start();
    this.focusInput();
  }

  close(): void {
    this.open.set(false);
    setTimeout(() => this.launcher()?.nativeElement.focus());
  }

  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') this.close();
  }

  restart(): void {
    this.messages.set([]);
    this.county = null;
    this.need = null;
    this.start();
  }

  // ---------- conversation ----------

  private start(): void {
    this.say('Hi! I can help you find free and low-cost help near you.');
    this.askCalifornia();
  }

  private askCalifornia(): void {
    this.step = 'ca';
    this.say('Are you in California?', [
      { label: 'Yes', run: () => this.answerCalifornia(true, 'Yes') },
      { label: 'No', run: () => this.answerCalifornia(false, 'No') },
    ]);
  }

  private answerCalifornia(yes: boolean, echo?: string): void {
    if (echo) this.user(echo);
    if (yes) return this.askLocation();
    this.say(
      'Right now CARES Connects only covers California. Dial 211 to reach local help in most of the United States. If you are in crisis, call or text 988.',
      [
        { label: 'Call 211', href: 'tel:211' },
        { label: 'Call or text 988', href: 'tel:988' },
        { label: 'Actually, I am in California', run: () => this.answerCalifornia(true, 'I am in California') },
      ],
    );
  }

  private askLocation(): void {
    this.step = 'location';
    void this.brain.warmUp(); // load the model while they type, so the next step is instant
    const top = [...(this.counties.value() ?? [])].sort((a, b) => b.resourceCount - a.resourceCount).slice(0, 3);
    this.say(
      'What is your ZIP code, city, or county?',
      top.map((c) => ({ label: `${c.name} County`, run: () => this.handleLocation(`${c.name} County`) })),
    );
  }

  private async handleLocation(text: string, echo = true): Promise<void> {
    if (echo) this.user(text);
    this.typing.set(true);
    const found = await firstValueFrom(this.api.locate(text)).catch(() => ({ kind: 'unknown' as const }));
    this.typing.set(false);
    if (found.kind === 'county') return this.setCounty(found.county, found.label);
    if (found.kind === 'choices') {
      return this.say(
        'Which one did you mean?',
        found.choices.slice(0, 6).map((c) => ({ label: c.label, run: () => this.setCounty(c.county, c.label, true) })),
      );
    }
    if (found.kind === 'outside') return this.answerCalifornia(false);
    // Not a place. It might be a question ("is this free?"), so let the brain try.
    const answer = await this.think(text);
    if (answer && !parseBrain(answer)) this.say(answer);
    this.say('I could not find that place in California. Try a ZIP code like 95678, or a city like Roseville.');
  }

  private setCounty(county: CountyRef, label: string, echo = false): void {
    if (echo) this.user(label);
    this.county = county;
    this.countyLabel = label;
    this.askNeed(`Got it: ${label}.`);
  }

  private askNeed(prefix?: string): void {
    this.step = 'need';
    const names = this.categoryName();
    const featured = FEATURED_NEEDS.filter((slug) => names.has(slug)).map((slug) => ({
      label: names.get(slug)!,
      run: () => this.chooseNeed(slug, true),
    }));
    this.say(`${prefix ? prefix + ' ' : ''}What do you need help with? Pick one, or tell me in your own words.`, [
      ...featured,
      { label: 'Something else', run: () => this.showAllNeeds() },
    ]);
  }

  private showAllNeeds(): void {
    this.user('Something else');
    const all = [...this.categoryName()].map(([slug, name]) => ({ label: name, run: () => this.chooseNeed(slug, true) }));
    this.say('Here is everything we cover:', all);
  }

  private async handleNeed(text: string): Promise<void> {
    this.user(text);
    // Known need phrase ("food pantry", "rent help")? Use it directly; the brain handles the rest.
    const phrase = await this.brain.matchPhrase(text);
    if (phrase && this.categoryName().has(phrase)) return this.chooseNeed(phrase);
    const answer = await this.think(text);
    const parsed = answer ? parseBrain(answer) : null;
    if (parsed && 'crisis' in parsed) return this.showCrisis();
    if (parsed && 'need' in parsed && this.categoryName().has(parsed.need)) return this.chooseNeed(parsed.need);
    if (answer && !parsed) {
      // An FAQ answer or a polite "I only help with…": show it, then ask again.
      this.say(answer);
      return this.askNeed();
    }
    this.say('Sorry, I did not catch that. Could you pick the closest one?');
    this.askNeed();
  }

  private chooseNeed(slug: string, echo = false): void {
    const name = this.categoryName().get(slug) ?? slug;
    if (echo) this.user(name);
    this.need = slug;
    this.step = 'followup';
    const follow = FOLLOW_UPS[slug] ?? GENERIC_FOLLOW_UP;
    this.say(
      `${name}. ${follow.question}`,
      follow.options.map((o: FollowUpOption) => ({ label: o.label, run: () => this.search(o.q, o.label) })),
    );
  }

  private async search(q: string | undefined, echo?: string): Promise<void> {
    if (echo) this.user(echo);
    if (!this.county || !this.need) return this.askLocation();
    this.typing.set(true);
    const query = { category: this.need, county: this.county.slug };
    let items = await firstValueFrom(this.api.resources({ ...query, q })).catch(() => [] as PublicResource[]);
    let note = '';
    if (q && !items.length) {
      items = await firstValueFrom(this.api.resources(query)).catch(() => [] as PublicResource[]);
      if (items.length) note = 'I did not find an exact match, so here is everything in this category. ';
    }
    this.typing.set(false);
    this.step = 'done';
    const name = this.categoryName().get(this.need) ?? 'help';
    if (!items.length) {
      return this.say(
        `I did not find ${name.toLowerCase()} listings for ${this.countyLabel} yet. Dial 211 to talk with a person who can point you to local programs.`,
        this.afterResults(),
      );
    }
    this.say(`${note}Here ${items.length === 1 ? 'is 1 place' : `are ${items.length} places`} for ${name.toLowerCase()} in ${this.countyLabel}:`);
    this.push({
      from: 'bot',
      results: { items: items.slice(0, RESULT_LIMIT), total: items.length, categorySlug: this.need, countySlug: this.county.slug },
    });
    this.say('Please call ahead to confirm hours and eligibility.', this.afterResults());
  }

  private afterResults(): Reply[] {
    return [
      { label: 'Find a different kind of help', run: () => { this.user('Something different'); this.askNeed(); } },
      { label: 'Change location', run: () => { this.user('Change location'); this.askLocation(); } },
      { label: 'Talk to a person (211)', href: 'tel:211' },
    ];
  }

  private showCrisis(): void {
    this.push({ from: 'bot', crisis: true });
    const replies: Reply[] = [
      { label: 'Call 911', href: 'tel:911' },
      { label: 'Call 988', href: 'tel:988' },
      { label: 'Text 988', href: 'sms:988' },
    ];
    if (this.county) replies.push({ label: 'Crisis lines near me', run: () => { this.need = 'crisis-help-lines'; void this.search(undefined, 'Crisis lines near me'); } });
    replies.push({ label: 'Keep looking for help', run: () => { this.user('Keep looking'); this.county ? this.askNeed() : this.askLocation(); } });
    this.replies.set(replies);
  }

  /** Free-text box. Crisis rules first, then whatever the current step expects. */
  async submit(): Promise<void> {
    const text = this.draft().trim();
    if (!text || this.typing()) return;
    this.draft.set('');
    if (isCrisis(text)) {
      this.user(text);
      return this.showCrisis();
    }
    switch (this.step) {
      case 'ca': {
        const yn = parseYesNo(text);
        if (yn) return this.answerCalifornia(yn === 'yes', text);
        // Typed a place straight away? Treat that as "yes" plus the location.
        this.user(text);
        this.typing.set(true);
        const found = await firstValueFrom(this.api.locate(text)).catch(() => ({ kind: 'unknown' as const }));
        this.typing.set(false);
        if (found.kind === 'county') return this.setCounty(found.county, found.label);
        if (found.kind === 'outside') return this.answerCalifornia(false);
        return this.answerWithBrain(text, () => this.askCalifornia());
      }
      case 'location':
        return this.handleLocation(text);
      case 'followup':
        // Their own words narrow the search ("spanish", "for my son").
        return this.search(text, text);
      case 'need':
      case 'done':
      default:
        return this.handleNeed(text);
    }
  }

  /** Brain answers a question outside the flow, then the current step is asked again. */
  private async answerWithBrain(text: string, reask: () => void): Promise<void> {
    const answer = await this.think(text);
    const parsed = answer ? parseBrain(answer) : null;
    if (parsed && 'crisis' in parsed) return this.showCrisis();
    if (answer && !parsed) this.say(answer);
    reask();
  }

  private async think(text: string): Promise<string | null> {
    this.typing.set(true);
    try {
      return await this.brain.ask(text);
    } finally {
      this.typing.set(false);
    }
  }

  // ---------- helpers ----------

  private say(text: string, replies?: Reply[]): void {
    this.push({ from: 'bot', text });
    if (replies) this.replies.set(replies);
  }

  private user(text: string): void {
    this.replies.set([]);
    this.push({ from: 'user', text });
  }

  private push(m: Omit<Message, 'id'>): void {
    this.messages.update((list) => [...list, { ...m, id: this.nextId++ }]);
    if (this.browser) setTimeout(() => this.log()?.nativeElement.scrollTo({ top: 1e9, behavior: 'smooth' }));
  }

  private focusInput(): void {
    if (this.browser) setTimeout(() => this.input()?.nativeElement.focus(), 50);
  }
}

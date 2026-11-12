import { Component, inject, signal } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';
import { ChatWidget } from '../chat/chat-widget';
import { CONTACT_EMAIL, IMAGES, LINKS } from '../site-content';

@Component({
  selector: 'app-public-layout',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, MatIconModule, ChatWidget],
  templateUrl: './public-layout.html',
  styleUrl: './public-layout.scss',
})
export class PublicLayout {
  readonly year = new Date().getFullYear();
  readonly links = LINKS;
  readonly email = CONTACT_EMAIL;
  readonly logo = IMAGES.logo;
  readonly menuOpen = signal(false);

  constructor() {
    // Close the phone menu after navigating.
    inject(Router)
      .events.pipe(filter((e) => e instanceof NavigationEnd))
      .subscribe(() => this.menuOpen.set(false));
  }
}

import { Routes } from '@angular/router';
import { authGuard } from './core/auth';

export const routes: Routes = [
  {
    path: 'admin/login',
    title: 'Sign in · CARES Connects',
    loadComponent: () => import('./admin/login/login').then((m) => m.Login),
  },
  {
    path: 'admin',
    canActivate: [authGuard],
    loadComponent: () => import('./admin/admin-layout/admin-layout').then((m) => m.AdminLayout),
    children: [
      {
        path: '',
        title: 'Resources · CARES Admin',
        loadComponent: () => import('./admin/resource-list/resource-list').then((m) => m.ResourceList),
      },
      {
        path: 'resources/new',
        title: 'New resource · CARES Admin',
        loadComponent: () => import('./admin/resource-form/resource-form').then((m) => m.ResourceForm),
        canDeactivate: [(c: { canLeave(): boolean }) => c.canLeave()],
      },
      {
        path: 'resources/:id',
        title: 'Edit resource · CARES Admin',
        loadComponent: () => import('./admin/resource-form/resource-form').then((m) => m.ResourceForm),
        canDeactivate: [(c: { canLeave(): boolean }) => c.canLeave()],
      },
      {
        path: 'discover',
        title: 'Discover · CARES Admin',
        loadComponent: () => import('./admin/discover/discover').then((m) => m.Discover),
      },
      {
        path: 'submissions',
        title: 'Submissions · CARES Admin',
        loadComponent: () => import('./admin/submissions/submissions').then((m) => m.Submissions),
      },
      {
        path: 'messages',
        title: 'Messages · CARES Admin',
        loadComponent: () => import('./admin/messages/messages').then((m) => m.Messages),
      },
      {
        path: 'categories',
        title: 'Categories · CARES Admin',
        loadComponent: () => import('./admin/categories/categories').then((m) => m.Categories),
      },
      {
        path: 'account',
        title: 'Account · CARES Admin',
        loadComponent: () => import('./admin/account/account').then((m) => m.Account),
      },
    ],
  },
  {
    path: '',
    loadComponent: () => import('./public/public-layout/public-layout').then((m) => m.PublicLayout),
    children: [
      {
        path: '',
        loadComponent: () => import('./public/home/home').then((m) => m.Home),
      },
      {
        path: 'find',
        loadComponent: () => import('./public/find-help/find-help').then((m) => m.FindHelp),
      },
      {
        path: 'about',
        loadComponent: () => import('./public/info/about').then((m) => m.About),
      },
      {
        path: 'contact',
        loadComponent: () => import('./public/info/contact').then((m) => m.Contact),
      },
      {
        path: 'contact/thanks',
        loadComponent: () => import('./public/info/contact-thanks/contact-thanks').then((m) => m.ContactThanks),
      },
      {
        path: 'donate',
        loadComponent: () => import('./public/info/donate').then((m) => m.Donate),
      },
      {
        path: 'category/:slug',
        loadComponent: () => import('./public/category/category').then((m) => m.CategoryPage),
      },
      {
        path: 'resources',
        loadComponent: () => import('./public/directory/directory').then((m) => m.DirectoryPage),
      },
      {
        path: 'list-your-organization',
        loadComponent: () => import('./public/list-organization/list-organization').then((m) => m.ListOrganization),
      },
      {
        path: 'list-your-organization/thanks',
        loadComponent: () => import('./public/list-organization/thanks/thanks').then((m) => m.ListingThanks),
      },
      {
        path: 'list-your-organization/verify',
        loadComponent: () => import('./public/list-organization/verify/verify').then((m) => m.ListingVerify),
      },
      { path: 'resource', redirectTo: 'resources', pathMatch: 'full' },
      {
        path: 'resource/:id',
        loadComponent: () => import('./public/resource-detail/resource-detail').then((m) => m.ResourceDetail),
      },
      {
        path: '**',
        loadComponent: () => import('./public/not-found/not-found').then((m) => m.NotFound),
      },
    ],
  },
];

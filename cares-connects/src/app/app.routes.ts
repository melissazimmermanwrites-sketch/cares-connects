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
        path: 'category/:slug',
        loadComponent: () => import('./public/category/category').then((m) => m.CategoryPage),
      },
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

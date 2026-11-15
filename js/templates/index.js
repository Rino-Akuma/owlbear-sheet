// Реєстр систем. Щоб додати нову — створіть файл шаблону і додайте його сюди.
import kontynent from './kontynent.js';
import dnd5e from './dnd5e.js';

export const TEMPLATES = [dnd5e, kontynent];
export const getTemplate = (id) => TEMPLATES.find((t) => t.id === id) || null;

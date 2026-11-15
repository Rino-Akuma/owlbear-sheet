// Реєстр систем. Щоб додати нову — створіть файл шаблону і додайте його сюди.
import kontynent from './kontynent.js';

export const TEMPLATES = [kontynent];
export const getTemplate = (id) => TEMPLATES.find((t) => t.id === id) || null;

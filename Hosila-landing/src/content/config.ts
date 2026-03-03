import { z, defineCollection } from 'astro:content';

const blogCollection = defineCollection({
    type: 'content',
    schema: z.object({
        title: z.string(),
        date: z.coerce.date(),
        summary: z.string(),
        author: z.string().default('Hosila Team'),
        image: z.string().optional(),
        featured: z.boolean().default(false),
    }),
});

export const collections = {
    'blog': blogCollection,
};

import { RestaurantMenu } from '@/components/restaurant';

export function RestaurantPage() {
    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-2xl font-bold text-white">Restaurant</h2>
                <p className="text-slate-400">Order food, beverages, and manage service orders</p>
            </div>

            <RestaurantMenu />
        </div>
    );
}


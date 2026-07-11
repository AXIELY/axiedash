import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

export interface InventoryItem {
  id: string;
  user_id: string;
  item_type: string;
  item_id: string;
  quantity: number;
  rarity: string;
  equipped: boolean;
  obtained_at: string;
}

export const usePlayerInventory = () => {
  const { user } = useAuth();
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (user?.id) {
      fetchInventory();
    }
  }, [user?.id]);

  const fetchInventory = async () => {
    if (!user?.id) return;

    try {
      setLoading(true);
      const { data, error: err } = await supabase
        .from('player_inventory')
        .select('*')
        .eq('user_id', user.id);

      if (err) throw err;
      setInventory(data || []);
    } catch (err) {
      console.error('Error fetching inventory:', err);
      setError('Failed to load inventory');
    } finally {
      setLoading(false);
    }
  };

  const addItem = async (itemType: string, itemId: string, quantity: number = 1, rarity: string = 'common') => {
    if (!user?.id) return;

    try {
      const { error: err } = await supabase.from('player_inventory').upsert(
        {
          user_id: user.id,
          item_type: itemType,
          item_id: itemId,
          quantity,
          rarity,
          obtained_at: new Date().toISOString(),
        },
        { onConflict: 'user_id, item_type, item_id' }
      );

      if (err) throw err;
      fetchInventory();
    } catch (err) {
      console.error('Error adding item:', err);
      setError('Failed to add item');
    }
  };

  const equipItem = async (inventoryId: string, equipped: boolean) => {
    try {
      const { error: err } = await supabase
        .from('player_inventory')
        .update({ equipped })
        .eq('id', inventoryId);

      if (err) throw err;
      fetchInventory();
    } catch (err) {
      console.error('Error equipping item:', err);
      setError('Failed to equip item');
    }
  };

  const getEquippedItem = (category: string) => {
    return inventory.find((item) => item.item_type === category && item.equipped);
  };

  const getItemsByRarity = (rarity: string) => {
    return inventory.filter((item) => item.rarity === rarity);
  };

  return {
    inventory,
    loading,
    error,
    fetchInventory,
    addItem,
    equipItem,
    getEquippedItem,
    getItemsByRarity,
  };
};
